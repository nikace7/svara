'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Mic, Send, Square, X } from 'lucide-react';
import { Button, StatusBadge } from '@svara/ui';
import { GenerationOwner, LabAudio } from '@svara/audio';
import type { AnswerPlayback } from '@svara/audio';
import { MAX_QUESTION_AUDIO_BYTES } from '@svara/contracts';
import type { ConversationSession, Locale, ProviderMode, TurnEvent } from '@svara/contracts';
import { ConversationApiError, readTurnStream } from '../lib/conversation';
import type { ConversationApi } from '../lib/conversation';
import { decodeAudioPacket, encodeAudio } from '../lib/voice-stream';

/** Visitor copy in both languages. Nepali is a reviewed-draft; see docs/M6-CONVERSATIONS.md. */
const copy = {
  en: {
    placeholder: 'Type your question',
    ask: 'Ask',
    voice: 'Ask by voice',
    send: 'Send question',
    stop: 'Stop speaking',
    end: 'End conversation',
    you: 'You',
    assistant: 'Assistant',
    listening: 'Listening… press Send question when you finish.',
    thinking: 'Answering…',
    interrupted: 'Interrupted',
    failed: 'Not answered',
    references: 'From',
    demo: 'Demo mode: answers quote approved information and speech is off.',
    reconnect: 'Reconnect',
    resumed: 'Restored from the previous conversation. The last unfinished answer was interrupted.',
    audioFailed: 'Answer audio could not play; read it here.',
    micDenied: 'Microphone permission was denied. Type the question instead.',
    micUnavailable: 'The microphone is unavailable. Type the question instead.',
    micStopped: 'The microphone stopped. Type the question instead.',
    dropped: 'The connection dropped mid-answer. Reconnect to continue this conversation.',
    errors: {
      PROVIDER_QUOTA: 'The provider quota is exhausted. Read any partial text and retry later.',
      TTS_UNAVAILABLE: 'Speech is unavailable for this answer. The text is complete.',
      STT_UNAVAILABLE: 'Recognition is unavailable. Type the question instead.',
      PROVIDER_UNAVAILABLE: 'The assistant did not answer. Read any partial text or retry.',
      NO_SPEECH: 'No speech was heard. Try again, or type the question.',
      SESSION_ENDED: 'This conversation has ended. Start a new one.',
    },
  },
  ne: {
    placeholder: 'आफ्नो प्रश्न लेख्नुहोस्',
    ask: 'सोध्नुहोस्',
    voice: 'बोलेर सोध्नुहोस्',
    send: 'प्रश्न पठाउनुहोस्',
    stop: 'बोल्न रोक्नुहोस्',
    end: 'कुराकानी अन्त्य गर्नुहोस्',
    you: 'तपाईं',
    assistant: 'सहायक',
    listening: 'सुन्दै छु… सकिएपछि ‘प्रश्न पठाउनुहोस्’ थिच्नुहोस्।',
    thinking: 'उत्तर दिँदै…',
    interrupted: 'रोकिएको',
    failed: 'उत्तर आएन',
    references: 'स्रोत',
    demo: 'डेमो मोड: उत्तरहरू स्वीकृत जानकारीबाट लिइन्छन् र आवाज बन्द छ।',
    reconnect: 'फेरि जोड्नुहोस्',
    resumed: 'अघिल्लो कुराकानी फर्काइयो। अन्तिम अधुरो उत्तर रोकिएको थियो।',
    audioFailed: 'उत्तरको आवाज बज्न सकेन; यहाँ पढ्नुहोस्।',
    micDenied: 'माइक्रोफोन अनुमति दिइएन। बरु प्रश्न लेख्नुहोस्।',
    micUnavailable: 'माइक्रोफोन उपलब्ध छैन। बरु प्रश्न लेख्नुहोस्।',
    micStopped: 'माइक्रोफोन बन्द भयो। बरु प्रश्न लेख्नुहोस्।',
    dropped: 'उत्तरको बीचमा जडान टुट्यो। यो कुराकानी जारी राख्न फेरि जोड्नुहोस्।',
    errors: {
      PROVIDER_QUOTA: 'सेवाको कोटा सकियो। आएको उत्तर पढ्नुहोस् र पछि फेरि प्रयास गर्नुहोस्।',
      TTS_UNAVAILABLE: 'यो उत्तरको आवाज उपलब्ध छैन। लेखिएको उत्तर पूरा छ।',
      STT_UNAVAILABLE: 'बोली पहिचान उपलब्ध छैन। बरु प्रश्न लेख्नुहोस्।',
      PROVIDER_UNAVAILABLE: 'सहायकले उत्तर दिएन। आएको उत्तर पढ्नुहोस् वा फेरि प्रयास गर्नुहोस्।',
      NO_SPEECH: 'कुनै बोली सुनिएन। फेरि प्रयास गर्नुहोस् वा प्रश्न लेख्नुहोस्।',
      SESSION_ENDED: 'यो कुराकानी सकियो। नयाँ सुरु गर्नुहोस्।',
    },
  },
} as const;

/** A browser that refuses autoplay never starts audio output; the answer carries on as text. */
const AUDIO_START_MS = 2000;
function within<T>(started: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, fail) => {
    timer = setTimeout(() => fail(new Error('Audio output did not start.')), ms);
  });
  return Promise.race([started, late]).finally(() => clearTimeout(timer));
}

interface Turn {
  key: string;
  locale: Locale;
  question: string;
  answer: string;
  state: 'answering' | 'completed' | 'interrupted' | 'failed';
  citations: { entryId: string; title: string }[];
  tools: { name: string; status: string }[];
  note?: string;
}
type Phase = 'idle' | 'recording' | 'answering';
const ended = new Set([
  'SESSION_ENDED',
  'NOT_FOUND',
  'LINK_UNAVAILABLE',
  'VISITOR_UNAUTHENTICATED',
]);

export interface ConversationPanelProps {
  api: ConversationApi;
  providerMode: ProviderMode;
  greeting: { en: string; ne: string };
  /** Staff choose the release; kiosks and visitors are pinned by the server. */
  releaseId?: string;
  suggestions?: { en: readonly string[]; ne: readonly string[] };
  /** Shown instead of the controls when the conversation cannot start (e.g. kiosk updating). */
  unavailable?: string | null;
  onEvent?: (event: TurnEvent) => void;
  /** A new, ended or reset conversation: screens clear what the last visitor saw. */
  onReset?: () => void;
  heading?: string;
}

/** The one owner of a conversation's session, generation, microphone and speech output. */
export function ConversationPanel(props: ConversationPanelProps) {
  const { api, providerMode, greeting, releaseId, suggestions, unavailable, onEvent, onReset } =
    props;
  const [locale, setLocale] = useState<Locale>('en-US');
  const language = locale === 'ne-NP' ? 'ne' : 'en';
  const text = copy[language];
  const [turns, setTurns] = useState<Turn[]>([]);
  const log = useRef<HTMLDivElement>(null);
  // The newest turn is the one the visitor is waiting for: keep it in view as it streams.
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [turns]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [typed, setTyped] = useState('');
  const [resumeFrom, setResumeFrom] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const session = useRef<ConversationSession | null>(null);
  const owner = useRef(new GenerationOwner());
  const audio = useRef<LabAudio | null>(null);
  const audioControl = useRef<AbortController | null>(null);
  const frames = useRef<Uint8Array[] | null>(null);
  const live = providerMode === 'live';

  function stopAudio() {
    audioControl.current?.abort();
    audioControl.current = null;
    void audio.current?.stop();
    audio.current = null;
    frames.current = null;
  }
  const update = (key: string, change: (turn: Turn) => Turn) =>
    setTurns((current) => current.map((turn) => (turn.key === key ? change(turn) : turn)));
  function forget(message = '') {
    session.current = null;
    setHasSession(false);
    setTurns([]);
    setNotice(message);
    onReset?.();
  }

  useEffect(() => {
    const generations = owner.current;
    // Leaving the page stops the answer and releases the microphone and speaker.
    const release = () => {
      generations.cancel();
      audioControl.current?.abort();
      void audio.current?.stop();
      frames.current = null;
    };
    const hide = () => document.visibilityState === 'hidden' && release();
    window.addEventListener('pagehide', release);
    document.addEventListener('visibilitychange', hide);
    return () => {
      release();
      window.removeEventListener('pagehide', release);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);

  async function open(resume?: string): Promise<ConversationSession | null> {
    if (session.current) return session.current;
    try {
      const admission = await api.admit({
        locale,
        ...(releaseId ? { releaseId } : {}),
        ...(resume ? { resumeFrom: resume } : {}),
      });
      session.current = admission.session;
      setHasSession(true);
      setResumeFrom(null);
      if (resume)
        setTurns(
          admission.history.map((item, index) => ({
            key: `restored-${index}`,
            locale: item.locale,
            question: item.question,
            answer: item.answer,
            state: item.state === 'COMPLETED' ? 'completed' : 'interrupted',
            citations: [],
            tools: [],
          })),
        );
      setNotice(resume ? text.resumed : '');
      return admission.session;
    } catch (reason) {
      setResumeFrom(null);
      setError(
        reason instanceof ConversationApiError
          ? reason.message
          : 'The assistant is unreachable. Check the connection and try again.',
      );
      return null;
    }
  }

  async function ask(input: { text: string } | { audio: string }) {
    stopAudio();
    setError('');
    const current = await open();
    if (!current) return;
    const generation = owner.current.begin();
    const key = crypto.randomUUID();
    setTurns((all) => [
      ...all,
      {
        key,
        locale,
        question: 'text' in input ? input.text : '…',
        answer: '',
        state: 'answering',
        citations: [],
        tools: [],
      },
    ]);
    setPhase('answering');
    setAnnouncement(text.thinking);
    let playback: AnswerPlayback | undefined;
    let lastSegment: number | undefined;
    let speech = true;
    const playbackControl = new AbortController();
    try {
      const response = await api.turn(
        current.id,
        { generation: generation.id, clientMessageId: key, locale, ...input },
        AbortSignal.any([generation.signal, AbortSignal.timeout(130000)]),
      );
      for await (const event of readTurnStream(response, generation.id)) {
        if (!owner.current.accepts(generation.id)) return;
        onEvent?.(event);
        if (event.type === 'transcript') update(key, (turn) => ({ ...turn, question: event.text }));
        if (event.type === 'answer')
          update(key, (turn) => ({
            ...turn,
            answer: turn.answer ? `${turn.answer} ${event.text}` : event.text,
          }));
        if (event.type === 'reference' || event.type === 'complete')
          update(key, (turn) => ({
            ...turn,
            citations: [
              ...turn.citations,
              ...(event.citations ?? []).filter(
                (item) => !turn.citations.some((known) => known.entryId === item.entryId),
              ),
            ],
          }));
        if (event.type === 'tool' && event.tool)
          update(key, (turn) => ({
            ...turn,
            tools: [...turn.tools, { name: event.tool!.name, status: event.tool!.status }],
          }));
        if (
          event.type === 'audio' &&
          speech &&
          event.pcm !== undefined &&
          event.segment !== undefined
        ) {
          const silent = () => {
            speech = false;
            update(key, (turn) => ({ ...turn, note: text.audioFailed }));
          };
          if (!playback) {
            const player = new LabAudio();
            audio.current = player;
            audioControl.current = playbackControl;
            try {
              playback = await within(
                player.startAnswer(playbackControl.signal, generation.id, (state) => {
                  if (state === 'failed' && owner.current.accepts(generation.id)) silent();
                }),
                AUDIO_START_MS,
              );
            } catch {
              if (!owner.current.accepts(generation.id)) return;
              // A late start is disposed by the aborted signal; nothing plays out of turn.
              playbackControl.abort();
              silent();
            }
          }
          if (playback) {
            lastSegment = event.segment;
            playback.push(decodeAudioPacket(event.pcm), event.segment, event.end === true);
          }
        }
        // Failures are shown in the conversation's language; the server's text is English.
        const failure = event.code ? text.errors[event.code] : event.text;
        if (event.type === 'error' && event.code === 'TTS_UNAVAILABLE') {
          speech = false;
          update(key, (turn) => ({ ...turn, note: failure }));
        } else if (event.type === 'error') {
          playback?.finish(lastSegment);
          update(key, (turn) => ({ ...turn, state: 'failed', note: failure }));
          if (event.code === 'SESSION_ENDED') forget(failure);
          else setError(failure);
        }
        if (event.type === 'complete') {
          playback?.finish(lastSegment);
          update(key, (turn) => ({ ...turn, state: 'completed' }));
          setAnnouncement(text.assistant);
        }
      }
    } catch (reason) {
      if (!owner.current.accepts(generation.id)) return;
      playbackControl.abort();
      if (reason instanceof ConversationApiError) {
        update(key, (turn) => ({ ...turn, state: 'failed' }));
        if (ended.has(reason.code)) forget(reason.message);
        else setError(reason.message);
        return;
      }
      // The transport broke: nothing is replayed; the visitor restarts explicitly.
      update(key, (turn) => ({ ...turn, state: 'interrupted' }));
      setResumeFrom(current.id);
      session.current = null;
      setHasSession(false);
      setError(text.dropped);
    } finally {
      if (owner.current.accepts(generation.id)) setPhase('idle');
    }
  }

  /** Stops locally at once, then tells the server so nothing late is spoken or done. */
  function interrupt() {
    const generation = owner.current.cancel();
    stopAudio();
    setPhase('idle');
    setTurns((all) =>
      all.map((turn) => (turn.state === 'answering' ? { ...turn, state: 'interrupted' } : turn)),
    );
    const current = session.current;
    if (current) void api.interrupt(current.id, generation).catch(() => undefined);
  }
  async function end() {
    interrupt();
    const current = session.current;
    forget();
    setError('');
    if (current) await api.end(current.id).catch(() => undefined);
  }

  async function record() {
    interrupt();
    setError('');
    const control = new AbortController();
    const player = new LabAudio();
    const recorded: Uint8Array[] = [];
    let bytes = 0;
    audio.current = player;
    audioControl.current = control;
    frames.current = recorded;
    setPhase('recording');
    setAnnouncement(text.listening);
    try {
      await player.startCapture(
        control.signal,
        () => undefined,
        () => {
          if (!control.signal.aborted) {
            stopAudio();
            setPhase('idle');
            setError(text.micStopped);
          }
        },
        (pcm) => {
          if (frames.current !== recorded) return;
          recorded.push(new Uint8Array(pcm));
          bytes += pcm.byteLength;
          if (bytes >= MAX_QUESTION_AUDIO_BYTES) sendRecording();
        },
      );
    } catch (reason) {
      if (control.signal.aborted) return;
      stopAudio();
      setPhase('idle');
      setError(
        reason instanceof DOMException && reason.name === 'NotAllowedError'
          ? text.micDenied
          : text.micUnavailable,
      );
    }
  }
  /** Releases the microphone first, then sends the recording once; nothing is kept. */
  function sendRecording() {
    const recorded = frames.current;
    if (!recorded) return;
    stopAudio();
    const joined = new Uint8Array(
      Math.min(
        MAX_QUESTION_AUDIO_BYTES,
        recorded.reduce((total, frame) => total + frame.length, 0),
      ),
    );
    let offset = 0;
    for (const frame of recorded) {
      const part = frame.subarray(0, joined.length - offset);
      joined.set(part, offset);
      offset += part.length;
    }
    setPhase('idle');
    if (!joined.length) {
      setError('No audio was recorded. Speak after pressing the button, or type the question.');
      return;
    }
    void ask({ audio: encodeAudio(joined) });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = typed.trim();
    if (!question || phase === 'recording') return;
    setTyped('');
    void ask({ text: question });
  }

  return (
    <section className="conversation" aria-label={props.heading ?? 'Conversation'} lang={language}>
      <div className="conversation-bar">
        <div className="segmented" role="group" aria-label="Language">
          {(['en-US', 'ne-NP'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={locale === value}
              onClick={() => {
                // A new language is a new recognition stream: the current answer stops.
                if (phase !== 'idle') interrupt();
                setLocale(value);
              }}
            >
              {value === 'en-US' ? 'English' : 'नेपाली'}
            </button>
          ))}
        </div>
        {!live && <StatusBadge tone="warning">Demo mode</StatusBadge>}
      </div>
      {!live && <p className="muted conversation-demo">{text.demo}</p>}
      <div className="conversation-log" aria-live="off" ref={log}>
        {turns.length === 0 && <p className="conversation-greeting">{greeting[language]}</p>}
        {turns.map((turn) => (
          <article
            key={turn.key}
            className="conversation-turn"
            lang={turn.locale === 'ne-NP' ? 'ne' : 'en'}
          >
            <p className="conversation-question">
              <span className="eyebrow">{text.you}</span>
              {turn.question}
            </p>
            <div className="conversation-answer">
              <span className="eyebrow">
                {text.assistant}
                {turn.state === 'interrupted' && ` · ${text.interrupted}`}
                {turn.state === 'failed' && ` · ${text.failed}`}
              </span>
              <p>{turn.answer || (turn.state === 'answering' ? text.thinking : '')}</p>
              {turn.note && <p className="muted">{turn.note}</p>}
              {turn.citations.length > 0 && (
                <p className="conversation-references">
                  {text.references}: {turn.citations.map((item) => item.title).join(' · ')}
                </p>
              )}
              {/* Only a slide is visible to a visitor; references are listed above, and the
                  rest are recorded for staff in Sessions. */}
              {turn.tools
                .filter((tool) => tool.name === 'show_slide')
                .map((tool, index) => (
                  <p key={index} className="muted">
                    Slide: {tool.status.toLowerCase()}
                  </p>
                ))}
            </div>
          </article>
        ))}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-notice form-notice--error" role="alert">
          {error}
        </p>
      )}
      {unavailable ? (
        <p className="form-notice" role="status">
          {unavailable}
        </p>
      ) : (
        <>
          {turns.length === 0 && suggestions && suggestions[language].length > 0 && (
            <div className="conversation-suggestions">
              {suggestions[language].map((item) => (
                <Button key={item} variant="secondary" onClick={() => void ask({ text: item })}>
                  {item}
                </Button>
              ))}
            </div>
          )}
          <form className="conversation-input" onSubmit={submit}>
            <label className="sr-only" htmlFor="conversation-question">
              {text.placeholder}
            </label>
            <input
              id="conversation-question"
              className="input"
              value={typed}
              maxLength={2000}
              placeholder={text.placeholder}
              onChange={(event) => setTyped(event.target.value)}
              disabled={phase === 'recording'}
            />
            <Button type="submit" disabled={!typed.trim() || phase === 'recording'}>
              <Send size={16} aria-hidden="true" />
              {text.ask}
            </Button>
          </form>
          <div className="conversation-actions">
            {live &&
              (phase === 'recording' ? (
                <Button variant="primary" onClick={sendRecording}>
                  <Send size={16} aria-hidden="true" />
                  {text.send}
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => void record()}>
                  <Mic size={16} aria-hidden="true" />
                  {text.voice}
                </Button>
              ))}
            {phase === 'answering' && (
              <Button variant="secondary" onClick={interrupt}>
                <Square size={16} aria-hidden="true" />
                {text.stop}
              </Button>
            )}
            {resumeFrom && (
              <Button variant="secondary" onClick={() => void open(resumeFrom)}>
                {text.reconnect}
              </Button>
            )}
            {(turns.length > 0 || hasSession) && (
              <Button variant="quiet" onClick={() => void end()}>
                <X size={16} aria-hidden="true" />
                {text.end}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
