'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioLines, Clock3, Languages, Mic, Play, Square, Volume2 } from 'lucide-react';
import { Button, FormField, StatusBadge } from '@svara/ui';
import { GenerationOwner, LabAudio } from '@svara/audio';
import type { CaptureMeter } from '@svara/audio';
import type { FixtureScenarioId, Locale } from '@svara/contracts';
import { readVoiceStream } from '../lib/voice-stream';

type Phase = 'Ready' | 'Answering' | 'Completed' | 'Interrupted' | 'Failed';
const scenarios: { id: FixtureScenarioId; label: string }[] = [
  { id: 'supported_faq', label: 'Admissions office' },
  { id: 'unsupported_question', label: 'Missing fee detail' },
  { id: 'interrupt_answer', label: 'Long answer · interrupt test' },
  { id: 'tts_failure', label: 'Speech unavailable' },
  { id: 'provider_quota', label: 'Provider quota reached' },
];

export function VoiceLab() {
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

  async function run(text?: string) {
    stopAudio();
    const generation = owner.current.begin();
    setPhase('Answering');
    setQuestion('');
    setAnswer('');
    setError('');
    setFirstMs(null);
    setTotalMs(null);
    const start = performance.now();
    let receivedAnswer = false;
    try {
      const response = await fetch('/api/v1/feasibility/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          locale,
          generation: generation.id,
          ...(text === undefined ? { scenario } : { text }),
        }),
        signal: AbortSignal.any([generation.signal, AbortSignal.timeout(12000)]),
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
        if (event.type === 'complete') {
          setPhase('Completed');
          setTotalMs(event.elapsedMs);
        }
        if (event.type === 'error') {
          setPhase('Failed');
          setError(event.text);
          setTotalMs(event.elapsedMs);
        }
      }
    } catch {
      if (owner.current.accepts(generation.id)) {
        setPhase('Failed');
        setError('The local voice stream stopped. Read any partial text or retry the scenario.');
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
        <StatusBadge tone="warning">Text-only fixture</StatusBadge>
      </div>
      <div className="preview-notice">
        <AudioLines size={21} aria-hidden="true" />
        <div>
          <strong>A local place to listen, read and interrupt.</strong>
          <p>
            Scripted answers use synthetic campus information. Live recognition and speech are
            pending provider setup.
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
            disabled={busy}
            onClick={() => {
              void run();
            }}
          >
            <Play size={16} aria-hidden="true" />
            Run scenario
          </Button>
          <div className="voice-divider" />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (typed.trim()) void run(typed.trim());
            }}
          >
            <FormField
              label="Typed question"
              value={typed}
              maxLength={1000}
              onChange={(event) => setTyped(event.target.value)}
              help="Typed input tests the text fallback; fixture mode does not generate an answer to it."
            />
            <Button type="submit" disabled={busy}>
              Send text
            </Button>
          </form>
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
            Measured fixture timing includes deliberate replay delays. It is not live provider
            latency.
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
              Audio stays in this browser. This checks capture and PCM framing, not recognition.
              Stops after 30 seconds.
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
        Local fixture lab · no microphone uploads · no saved transcripts · live English/Nepali
        validation pending
      </p>
    </>
  );
}
