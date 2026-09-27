'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AudioLines, Clock3, Languages, Mic, Play, Square, Volume2 } from 'lucide-react';
import { Button, FormField, StatusBadge } from '@svara/ui';
import { GenerationOwner, LabAudio } from '@svara/audio';
import type { AnswerPlayback, CaptureMeter } from '@svara/audio';
import { MAX_QUESTION_AUDIO_BYTES, releasePageSchema } from '@svara/contracts';
import type { BotPage, FixtureScenarioId, Locale, ProviderMode } from '@svara/contracts';
import { decodeAudioPacket, encodeAudio, readVoiceStream } from '../lib/voice-stream';
import { errorMessage, StaffApiError, staffResponse } from '../lib/staff-api';
import { useStaffRequest, useStaffSession } from './session-provider';

type Phase = 'Ready' | 'Answering' | 'Completed' | 'Interrupted' | 'Failed';
const scenarios: { id: FixtureScenarioId; label: string }[] = [
  { id: 'supported_faq', label: 'Admissions office' },
  { id: 'unsupported_question', label: 'Missing fee detail' },
  { id: 'interrupt_answer', label: 'Long answer · interrupt test' },
  { id: 'tts_failure', label: 'Speech unavailable' },
  { id: 'provider_quota', label: 'Provider quota reached' },
];

export function VoiceLab({ mode }: { mode: ProviderMode }) {
  const live = mode === 'live';
  const { csrfToken, identity } = useStaffSession();
  const send = useStaffRequest();
  const [botId, setBotId] = useState('');
  const [releaseId, setReleaseId] = useState('');
  const membership = identity.membership.id;
  // ponytail: first page of bots and newest 50 releases; add search when a workspace outgrows it.
  const bots = useQuery({
    queryKey: ['bots', membership, 'voice-lab'],
    queryFn: ({ signal }) => send<BotPage>('/bots?page=1', { signal }),
    enabled: live,
  });
  const chosenBot = botId || bots.data?.items[0]?.id || '';
  const releases = useQuery({
    queryKey: ['releases', membership, chosenBot, 'voice-lab'],
    queryFn: async ({ signal }) =>
      releasePageSchema.parse(
        await send<unknown>(
          `/bots/${chosenBot}/releases?${new URLSearchParams({ kind: 'ALL', page: '1', pageSize: '50' })}`,
          { signal },
        ),
      ),
    enabled: live && !!chosenBot,
  });
  const release =
    releases.data?.items.find((item) => item.id === releaseId) ?? releases.data?.items[0];
  const groundingHelp = bots.isError
    ? errorMessage(bots.error)
    : releases.isError
      ? errorMessage(releases.error)
      : bots.data && !bots.data.items.length
        ? 'Create a bot and save a release before asking.'
        : releases.data && !release
          ? 'This bot has no saved releases. Save a preview or publish a version first.'
          : release
            ? "Answers use only this release's knowledge."
            : 'Loading releases…';
  const [locale, setLocale] = useState<Locale>('en-US');
  const [scenario, setScenario] = useState<FixtureScenarioId>('supported_faq');
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<Phase>('Ready');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [firstMs, setFirstMs] = useState<number | null>(null);
  const [totalMs, setTotalMs] = useState<number | null>(null);
  const [mic, setMic] = useState<'off' | 'starting' | 'active'>('off');
  const [recording, setRecording] = useState(false);
  // The spoken question being recorded; null whenever no recording is in progress.
  const frames = useRef<Uint8Array[] | null>(null);
  const [meter, setMeter] = useState<CaptureMeter | null>(null);
  const [speaker, setSpeaker] = useState('Not tested');
  const [speakerBusy, setSpeakerBusy] = useState(false);
  const owner = useRef(new GenerationOwner());
  const audio = useRef<LabAudio | null>(null);
  const audioSignal = useRef<AbortController | null>(null);
  const audioTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function stopAudio() {
    clearTimeout(audioTimer.current);
    audioSignal.current?.abort();
    audioSignal.current = null;
    void audio.current?.stop();
    audio.current = null;
    frames.current = null;
    setRecording(false);
    setMic('off');
    setMeter(null);
    setSpeakerBusy(false);
    setSpeaker((current) =>
      current === 'Playing test tone' || current === 'Starting speaker' ? 'Stopped' : current,
    );
  }
  function interrupt(clear = false) {
    owner.current.cancel();
    stopAudio();
    setPhase(clear ? 'Ready' : 'Interrupted');
    if (clear) {
      setQuestion('');
      setAnswer('');
      setError('');
      setFirstMs(null);
      setTotalMs(null);
      setTyped('');
    }
  }
  useEffect(() => {
    const generationOwner = owner.current;
    const dispose = () => {
      generationOwner.cancel();
      clearTimeout(audioTimer.current);
      audioSignal.current?.abort();
      void audio.current?.stop();
    };
    const suspend = () => {
      dispose();
      frames.current = null;
      setRecording(false);
      setMic('off');
      setMeter(null);
      setSpeakerBusy(false);
      setSpeaker('Stopped');
      setPhase((current) => (current === 'Answering' ? 'Interrupted' : current));
    };
    const hide = () => {
      if (document.visibilityState === 'hidden') suspend();
    };
    window.addEventListener('pagehide', suspend);
    document.addEventListener('visibilitychange', hide);
    return () => {
      dispose();
      window.removeEventListener('pagehide', suspend);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);

  async function run(input?: { text: string } | { audio: string }) {
    stopAudio();
    const generation = owner.current.begin();
    const playbackControl = new AbortController();
    let playback: AnswerPlayback | undefined;
    let lastSegment: number | undefined;
    setPhase('Answering');
    setQuestion('');
    setAnswer('');
    setError('');
    setFirstMs(null);
    setTotalMs(null);
    const start = performance.now();
    let receivedAnswer = false;
    try {
      const response = await staffResponse('/feasibility/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        cache: 'no-store',
        body: JSON.stringify({
          locale,
          generation: generation.id,
          ...(input ?? { scenario }),
          ...(live && input && release ? { releaseId: release.id } : {}),
        }),
        signal: AbortSignal.any([generation.signal, AbortSignal.timeout(live ? 130000 : 12000)]),
      });
      for await (const event of readVoiceStream(response, generation.id)) {
        if (!owner.current.accepts(generation.id)) return;
        if (event.type === 'transcript') setQuestion(event.text);
        if (event.type === 'answer') {
          if (!receivedAnswer) {
            setFirstMs(performance.now() - start);
            receivedAnswer = true;
          }
          setAnswer((current) => current + event.text);
        }
        if (event.type === 'audio' && event.pcm !== undefined && event.segment !== undefined) {
          if (!playback) {
            audioSignal.current = playbackControl;
            const session = new LabAudio();
            audio.current = session;
            setSpeaker('Playing answer');
            playback = await session.startAnswer(playbackControl.signal, generation.id, (type) => {
              if (!owner.current.accepts(generation.id)) return;
              if (type === 'completed') setSpeaker('Answer finished');
              if (type === 'failed') {
                setSpeaker('Speaker unavailable');
                setError(
                  'Answer audio could not play. Press Test speaker once, then retry the question.',
                );
              }
            });
          }
          lastSegment = event.segment;
          playback.push(decodeAudioPacket(event.pcm), event.segment, event.end === true);
        }
        if (event.type === 'complete') {
          playback?.finish(lastSegment);
          setPhase('Completed');
          setTotalMs(event.elapsedMs);
        }
        if (event.type === 'error') {
          playback?.finish(lastSegment);
          setPhase('Failed');
          setError(event.text);
          setTotalMs(event.elapsedMs);
        }
      }
    } catch (reason) {
      playbackControl.abort();
      if (owner.current.accepts(generation.id)) {
        setPhase('Failed');
        // A refused request (unknown or expired release) says why; a broken stream cannot.
        setError(
          reason instanceof StaffApiError
            ? reason.message
            : 'The local voice stream stopped. Read any partial text or retry the scenario.',
        );
      }
    }
  }

  function prepareAudio() {
    stopAudio();
    owner.current.cancel();
    if (phase === 'Answering') setPhase('Interrupted');
    setError('');
    const controller = new AbortController();
    const session = new LabAudio();
    audioSignal.current = controller;
    audio.current = session;
    return { session, controller };
  }
  async function testMicrophone() {
    const { session, controller } = prepareAudio();
    setMic('starting');
    // Permission prompts may remain pending; the Stop button can always cancel ownership.
    audioTimer.current = setTimeout(() => {
      stopAudio();
    }, 30000);
    try {
      await session.startCapture(controller.signal, setMeter, () => {
        if (!controller.signal.aborted) {
          stopAudio();
          setError('Microphone disconnected or audio processing failed. Use text or retry.');
        }
      });
      if (!controller.signal.aborted) setMic('active');
    } catch (reason) {
      if (controller.signal.aborted) return;
      stopAudio();
      setError(
        reason instanceof DOMException && reason.name === 'NotAllowedError'
          ? 'Microphone permission denied. You can still use the text scenarios.'
          : 'Microphone unavailable. You can still use text or retry on a supported browser.',
      );
    }
  }
  async function recordQuestion() {
    const { session, controller } = prepareAudio();
    const recorded: Uint8Array[] = [];
    let bytes = 0;
    frames.current = recorded;
    setRecording(true);
    setMic('starting');
    try {
      await session.startCapture(
        controller.signal,
        setMeter,
        () => {
          if (!controller.signal.aborted) {
            stopAudio();
            setError(
              'Microphone disconnected or audio processing failed. Type the question instead.',
            );
          }
        },
        (pcm) => {
          if (frames.current !== recorded) return;
          recorded.push(new Uint8Array(pcm));
          bytes += pcm.byteLength;
          if (bytes >= MAX_QUESTION_AUDIO_BYTES) askRecorded();
        },
      );
      if (!controller.signal.aborted) setMic('active');
    } catch (reason) {
      if (controller.signal.aborted) return;
      stopAudio();
      setError(
        reason instanceof DOMException && reason.name === 'NotAllowedError'
          ? 'Microphone permission denied. Type the question instead.'
          : 'Microphone unavailable. Type the question instead.',
      );
    }
  }
  /** Releases the microphone first, then sends the recording once; nothing is kept. */
  function askRecorded() {
    const recorded = frames.current;
    if (!recorded) return;
    stopAudio();
    const bytes = new Uint8Array(
      Math.min(
        MAX_QUESTION_AUDIO_BYTES,
        recorded.reduce((total, frame) => total + frame.length, 0),
      ),
    );
    let offset = 0;
    for (const frame of recorded) {
      const part = frame.subarray(0, bytes.length - offset);
      bytes.set(part, offset);
      offset += part.length;
    }
    if (!bytes.length) {
      setError('No audio was recorded. Speak after pressing Ask by voice, or type the question.');
      return;
    }
    void run({ audio: encodeAudio(bytes) });
  }
  async function testSpeaker() {
    const { session, controller } = prepareAudio();
    setSpeakerBusy(true);
    setSpeaker('Starting speaker');
    audioTimer.current = setTimeout(() => {
      stopAudio();
      setError('Speaker test timed out. Retry after enabling audio.');
    }, 5000);
    try {
      await session.playTone(controller.signal, (event) => {
        if (controller.signal.aborted) return;
        if (event === 'started') setSpeaker('Playing test tone');
        else {
          clearTimeout(audioTimer.current);
          setSpeakerBusy(false);
          setSpeaker(event === 'completed' ? 'Test tone completed' : 'Speaker unavailable');
        }
      });
    } catch {
      if (!controller.signal.aborted) {
        stopAudio();
        setSpeaker('Speaker unavailable');
        setError('Audio playback unavailable. Text scenarios remain available.');
      }
    }
  }
  const busy = phase === 'Answering';
  const language = locale === 'ne-NP' ? 'ne' : 'en';

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">M1 / BILINGUAL FEASIBILITY</p>
          <h1>Voice lab</h1>
          <p className="page-description">
            One pipeline. Two languages. A clear account of what works.
          </p>
        </div>
        <StatusBadge tone={live ? 'success' : 'warning'}>
          {live ? 'Live providers' : 'Text-only fixture'}
        </StatusBadge>
      </div>
      <div className="preview-notice">
        <AudioLines size={21} aria-hidden="true" />
        <div>
          <strong>A local place to listen, read and interrupt.</strong>
          <p>
            {live
              ? 'Questions reach real providers and play synthesized speech. Type or record one; answers draw only on the release you choose.'
              : 'Scripted answers use synthetic campus information. Live recognition and speech are pending provider setup.'}
          </p>
        </div>
      </div>
      <div className="voice-grid">
        <section className="panel voice-controls" aria-labelledby="scenario-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">01 / INPUT</p>
              <h2 id="scenario-heading">Choose a conversation</h2>
            </div>
            <Languages size={22} aria-hidden="true" />
          </div>
          <div className="field">
            <label htmlFor="voice-language">Language</label>
            <select
              id="voice-language"
              className="input"
              value={locale}
              onChange={(event) => {
                interrupt(true);
                setLocale(event.target.value as Locale);
              }}
            >
              <option value="en-US">English · en-US</option>
              <option value="ne-NP">नेपाली · ne-NP</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="voice-scenario">Scenario</label>
            <select
              id="voice-scenario"
              className="input"
              value={scenario}
              disabled={live}
              onChange={(event) => {
                interrupt(true);
                setScenario(event.target.value as FixtureScenarioId);
              }}
            >
              {scenarios.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="primary"
            disabled={busy || live}
            onClick={() => {
              void run();
            }}
          >
            <Play size={16} aria-hidden="true" />
            Run scenario
          </Button>
          {live && (
            <p className="field-help">
              Scripted scenarios are fixture-only. In live mode, ask a typed question below.
            </p>
          )}
          <div className="voice-divider" />
          {live && (
            <>
              <div className="field">
                <label htmlFor="voice-bot">Bot</label>
                <select
                  id="voice-bot"
                  className="input"
                  value={chosenBot}
                  disabled={!bots.data?.items.length}
                  onChange={(event) => {
                    interrupt(true);
                    setBotId(event.target.value);
                    setReleaseId('');
                  }}
                >
                  {bots.data?.items.map((bot) => (
                    <option key={bot.id} value={bot.id}>
                      {bot.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="voice-release">Grounding release</label>
                <select
                  id="voice-release"
                  className="input"
                  value={release?.id ?? ''}
                  disabled={!releases.data?.items.length}
                  aria-describedby="voice-release-help"
                  onChange={(event) => {
                    interrupt(true);
                    setReleaseId(event.target.value);
                  }}
                >
                  {releases.data?.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.kind === 'PREVIEW' ? 'Staff preview' : `Version ${item.version}`} ·{' '}
                      {new Date(item.createdAt).toLocaleString()}
                    </option>
                  ))}
                </select>
                <p id="voice-release-help" className="field-help">
                  {groundingHelp}
                </p>
              </div>
            </>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (typed.trim()) void run({ text: typed.trim() });
            }}
          >
            <FormField
              label="Typed question"
              value={typed}
              maxLength={1000}
              onChange={(event) => setTyped(event.target.value)}
              help={
                live
                  ? 'Asks the provider and plays the spoken answer. Each question uses free-tier quota.'
                  : 'Typed input tests the text fallback; fixture mode does not generate an answer to it.'
              }
            />
            <Button
              type="submit"
              {...(live ? { variant: 'primary' as const } : {})}
              disabled={busy || (live && !release)}
            >
              {live ? 'Ask' : 'Send text'}
            </Button>
          </form>
          {live && (
            <>
              <div className="voice-actions">
                <Button
                  disabled={busy || !release || (mic !== 'off' && !recording)}
                  onClick={() => {
                    if (recording) askRecorded();
                    else void recordQuestion();
                  }}
                >
                  <Mic size={16} aria-hidden="true" />
                  {recording ? 'Stop and ask' : 'Ask by voice'}
                </Button>
              </div>
              <p className="field-help" aria-live="polite">
                {!recording
                  ? 'Records up to 15 seconds, sends it once for transcription and saves nothing.'
                  : mic === 'starting'
                    ? 'Waiting for microphone permission…'
                    : `Recording · ${Math.floor(((meter?.seq ?? -1) + 1) / 10)} of 15 seconds. Press Stop and ask when you finish.`}
              </p>
            </>
          )}
        </section>
        <section className="panel voice-conversation" aria-labelledby="subtitles-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">02 / SUBTITLES</p>
              <h2 id="subtitles-heading">Conversation preview</h2>
            </div>
            <span
              className={`voice-phase ${phase === 'Failed' ? 'voice-phase--failed' : ''}`}
              role="status"
            >
              {phase}
            </span>
          </div>
          <div className="voice-transcript" aria-label="Question transcript">
            <p className="eyebrow">VISITOR</p>
            <p lang={question ? language : 'en'}>
              {question || 'Choose a scenario or type a question to begin.'}
            </p>
          </div>
          <div
            className="voice-answer"
            aria-label="Answer subtitles"
            aria-live="polite"
            aria-atomic="false"
          >
            <p className="eyebrow">SVARA</p>
            <p lang={answer ? language : 'en'}>{answer || 'Your answer will appear here.'}</p>
          </div>
          {phase === 'Interrupted' && answer && (
            <p className="field-help">Partial text · interrupted. No speech was played.</p>
          )}
          <div className="voice-actions">
            <Button disabled={!busy && mic === 'off' && !speakerBusy} onClick={() => interrupt()}>
              <Square size={15} aria-hidden="true" />
              Interrupt
            </Button>
            <Button variant="quiet" onClick={() => interrupt(true)}>
              End & clear
            </Button>
          </div>
          <div className="voice-timings">
            <Clock3 size={16} aria-hidden="true" />
            <dl>
              <div>
                <dt>First subtitle · browser</dt>
                <dd>{firstMs === null ? '—' : `${Math.round(firstMs)} ms`}</dd>
              </div>
              <div>
                <dt>Turn duration · server</dt>
                <dd>{totalMs === null ? '—' : `${Math.round(totalMs)} ms`}</dd>
              </div>
            </dl>
          </div>
          <p className="field-help">
            {live
              ? 'Real provider latency: a spoken question adds one recognition request, and each sentence waits for its own speech request.'
              : 'Measured fixture timing includes deliberate replay delays. It is not live provider latency.'}
          </p>
        </section>
      </div>
      {error && (
        <div className="voice-error" role="alert">
          {error}
        </div>
      )}
      <section className="panel voice-audio" aria-labelledby="audio-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">03 / AUDIO CHECKS</p>
            <h2 id="audio-heading">Check your microphone & speaker</h2>
          </div>
          <Volume2 size={23} aria-hidden="true" />
        </div>
        <div className="voice-audio-grid">
          <div>
            <h3>Microphone · local only</h3>
            <p className="field-help">
              This check stays in this browser and never uploads; it tests capture and PCM framing,
              not recognition. Stops after 30 seconds.
            </p>
            <div className="voice-meter">
              <progress
                aria-label="Microphone level"
                max={1}
                value={Math.min(1, (meter?.rms ?? 0) * 4)}
              />
              <span className="mono">
                {mic === 'starting' ? 'Permission pending' : mic === 'active' ? 'Capturing' : 'Off'}
              </span>
            </div>
            <p className="mono voice-format">
              {meter
                ? `${meter.inputRate.toLocaleString()} → 16,000 Hz · ${meter.bytes} bytes · batch ${meter.seq + 1}`
                : '16 kHz · mono · PCM16 · 100 ms batches'}
            </p>
            <div className="voice-actions">
              <Button
                disabled={mic !== 'off'}
                onClick={() => {
                  void testMicrophone();
                }}
              >
                <Mic size={16} aria-hidden="true" />
                Test microphone
              </Button>
              <Button disabled={mic === 'off'} onClick={stopAudio}>
                Stop microphone
              </Button>
            </div>
          </div>
          <div>
            <h3>Speaker · generated test tone</h3>
            <p className="field-help">
              A short, quiet 440 Hz tone exercises the 24 kHz PCM playback queue. Speech recordings
              are not bundled.
            </p>
            <p className="voice-speaker-status" role="status">
              {speaker}
            </p>
            <div className="voice-actions">
              <Button
                disabled={speakerBusy}
                onClick={() => {
                  void testSpeaker();
                }}
              >
                <Volume2 size={16} aria-hidden="true" />
                Test speaker
              </Button>
              <Button disabled={!speakerBusy} onClick={stopAudio}>
                Stop speaker
              </Button>
            </div>
          </div>
        </div>
      </section>
      <p className="voice-footnote">
        {live
          ? 'Local live lab · typed or spoken questions · recordings sent once for transcription, never saved · provider keys stay on the server'
          : 'Local fixture lab · no microphone uploads · no saved transcripts · live English/Nepali validation pending'}
      </p>
    </>
  );
}
