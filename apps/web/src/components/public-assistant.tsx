'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { AudioLines } from 'lucide-react';
import { publicAssistantSchema, visitorGrantSchema } from '@svara/contracts';
import type { PublicAssistant as PublicConfig } from '@svara/contracts';
import { conversationApi } from '../lib/conversation';
import { ConversationPanel } from './conversation-panel';

type State =
  | { kind: 'loading' }
  | { kind: 'gone' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; config: PublicConfig; csrfToken: string };

async function open(slug: string): Promise<State> {
  const base = `/api/v1/public/assistants/${encodeURIComponent(slug)}`;
  const config = await fetch(base, { credentials: 'same-origin', cache: 'no-store' });
  if (config.status === 404) return { kind: 'gone' };
  if (!config.ok)
    return { kind: 'error', message: 'The assistant is unavailable. Try again shortly.' };
  // The grant is an HttpOnly cookie; the page only ever sees its CSRF token.
  const grant = await fetch(`${base}/grants`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (grant.status === 404) return { kind: 'gone' };
  if (!grant.ok)
    return {
      kind: 'error',
      message:
        grant.status === 429
          ? 'Too many visitors are opening this assistant. Wait a minute and reload.'
          : 'The assistant is unavailable. Try again shortly.',
    };
  return {
    kind: 'ready',
    config: publicAssistantSchema.parse(((await config.json()) as { data: unknown }).data),
    csrfToken: visitorGrantSchema.parse(((await grant.json()) as { data: unknown }).data).csrfToken,
  };
}

/** The public visitor page: the pinned release's greeting and slides, and a conversation. */
export function PublicAssistant({ slug }: { slug: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    let current = true;
    open(slug).then(
      (next) => current && setState(next),
      () =>
        current &&
        setState({ kind: 'error', message: 'The assistant is unreachable. Check the connection.' }),
    );
    return () => {
      current = false;
    };
  }, [slug]);

  if (state.kind === 'loading')
    return (
      <main className="assistant-page assistant-page--center">
        <p role="status">Opening the assistant…</p>
      </main>
    );
  if (state.kind !== 'ready')
    return (
      <main className="assistant-page assistant-page--center">
        <h1>
          {state.kind === 'gone' ? 'This assistant is not available' : 'Something went wrong'}
        </h1>
        <p className="muted">
          {state.kind === 'gone'
            ? 'The link may have expired or been turned off. Ask the organiser for a current link.'
            : state.message}
        </p>
      </main>
    );
  const { release, providerMode, suggestions } = state.config;
  const slides = release.slides.filter((slide) => slide.target !== 'SECONDARY');
  return (
    <main className="assistant-page">
      <header className="assistant-header">
        <AudioLines size={22} aria-hidden="true" />
        <h1>{release.botName}</h1>
      </header>
      <div className="assistant-body">
        <ConversationPanel
          api={conversationApi({ kind: 'visitor', slug, csrfToken: state.csrfToken })}
          providerMode={providerMode}
          greeting={release.greeting}
          suggestions={suggestions}
          heading={`Ask ${release.botName}`}
        />
        {slides.length > 0 && (
          <section className="assistant-slides" aria-label="Presentation">
            {slides.map((slide) => {
              const asset = release.media.find((item) => item.id === slide.mediaId);
              return (
                <figure key={slide.id} className="device-slide">
                  {asset && asset.mimeType !== 'video/mp4' && (
                    <Image
                      src={`/api/v1/public/assistants/${encodeURIComponent(slug)}/media/${asset.id}/content`}
                      alt=""
                      width={asset.width}
                      height={asset.height}
                      unoptimized
                    />
                  )}
                  <figcaption>
                    <strong lang="en">{slide.title.en}</strong>
                    {slide.title.ne && <strong lang="ne">{slide.title.ne}</strong>}
                    <span lang="en">{slide.body.en}</span>
                  </figcaption>
                </figure>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
