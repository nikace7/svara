'use client';

import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { Button } from '@svara/ui';
import type { ReleaseDetail } from '@svara/contracts';
import { SlidePreview } from './presentation-media';
import { ReleaseQuery } from './release-query';

const toolNames = {
  lookup_knowledge: 'Look up knowledge',
  get_event_schedule: 'Get event schedule',
  select_reference: 'Select reference',
  show_slide: 'Show slide',
};

export function ReleaseInspector({ release }: { release: ReleaseDetail }) {
  const [locale, setLocale] = useState<'en' | 'ne'>('en');
  const [orientation, setOrientation] = useState('landscape');
  const [slideIndex, setSlideIndex] = useState(0);
  const [mediaAttempt, setMediaAttempt] = useState(0);
  const [knowledgePage, setKnowledgePage] = useState(1);
  const { snapshot } = release;
  const { config } = snapshot.bot;
  const slide = snapshot.presentation?.slides[slideIndex] ?? null;
  const preview = slide
    ? { ...slide, media: snapshot.media.find((media) => media.id === slide.mediaId) ?? null }
    : null;
  return (
    <article className="panel release-inspector" aria-labelledby="release-inspector-title">
      <header className="release-snapshot-heading">
        <div className="release-section-heading">
          <p className="eyebrow">
            <LockKeyhole size={14} aria-hidden="true" />
            Immutable snapshot
          </p>
          <span className="release-badge">
            {release.providerMode === 'fixture' ? 'Fixture demo' : 'Live mode'}
          </span>
        </div>
        <h2 id="release-inspector-title">
          {release.kind === 'PREVIEW' ? 'Preview snapshot' : `Version ${release.version}`}
        </h2>
        <p className="muted small">
          Saved{' '}
          <time dateTime={release.createdAt}>{new Date(release.createdAt).toLocaleString()}</time> ·
          Draft revision {release.botRevision}
        </p>
        {release.previewExpiresAt && (
          <p className="small muted">
            New queries expire{' '}
            <time dateTime={release.previewExpiresAt}>
              {new Date(release.previewExpiresAt).toLocaleString()}
            </time>
            .
          </p>
        )}
        <div className="release-counts">
          <span>
            {snapshot.knowledge.length} knowledge{' '}
            {snapshot.knowledge.length === 1 ? 'entry' : 'entries'}
          </span>
          <span>
            {snapshot.presentation?.slides.length ?? 0}{' '}
            {snapshot.presentation?.slides.length === 1 ? 'slide' : 'slides'}
          </span>
          <span>
            {snapshot.media.length} media {snapshot.media.length === 1 ? 'file' : 'files'}
          </span>
        </div>
        <details className="release-reference">
          <summary>Snapshot reference</summary>
          <dl>
            <dt>Release ID</dt>
            <dd>
              <code>{release.id}</code>
            </dd>
            <dt>SHA-256</dt>
            <dd>
              <code>{release.snapshotHash}</code>
            </dd>
          </dl>
        </details>
      </header>
      <ReleaseQuery release={release} />
      <div className="release-content-heading">
        <h3>Saved content</h3>
        <div className="select-field">
          <label htmlFor="release-content-language">Content language</label>
          <select
            id="release-content-language"
            className="input"
            value={locale}
            onChange={(event) => setLocale(event.target.value as typeof locale)}
          >
            <option value="en">English</option>
            <option value="ne">Nepali / नेपाली</option>
          </select>
        </div>
      </div>
      <details className="release-content-section">
        <summary>Bot identity & voice</summary>
        <dl className="release-identity">
          <dt>Name</dt>
          <dd>{snapshot.bot.name}</dd>
          {snapshot.bot.description && (
            <>
              <dt>Description</dt>
              <dd>{snapshot.bot.description}</dd>
            </>
          )}
          <dt>Persona</dt>
          <dd className="release-text">{config.persona}</dd>
          <dt>Greeting</dt>
          <dd lang={locale} className="release-text">
            {config.greeting[locale]}
          </dd>
          <dt>Fallback</dt>
          <dd lang={locale} className="release-text">
            {config.fallback[locale]}
          </dd>
          <dt>Voice</dt>
          <dd>{locale === 'en' ? config.voiceEn : config.voiceNe}</dd>
          <dt>Allowed tools</dt>
          <dd>{config.tools.map((tool) => toolNames[tool]).join(' · ') || 'None'}</dd>
        </dl>
      </details>
      <details className="release-content-section" open>
        <summary>
          Knowledge · {snapshot.knowledge.length}{' '}
          {snapshot.knowledge.length === 1 ? 'entry' : 'entries'}
        </summary>
        {snapshot.knowledge.length === 0 ? (
          <p className="muted">This snapshot has no selected knowledge.</p>
        ) : (
          <>
            <ul className="release-knowledge">
              {snapshot.knowledge
                .slice((knowledgePage - 1) * 10, knowledgePage * 10)
                .map((entry) => (
                  <li key={entry.id}>
                    <div className="release-section-heading">
                      <h4>{entry.title}</h4>
                      <span
                        className={`release-badge${entry.status === 'DRAFT' ? ' release-badge--draft' : ''}`}
                      >
                        {entry.status === 'DRAFT' ? 'Draft · For staff testing' : 'Approved'}
                      </span>
                    </div>
                    {entry.question[locale] && (
                      <p className="release-question" lang={locale}>
                        {entry.question[locale]}
                      </p>
                    )}
                    <p lang={locale} className="release-text">
                      {entry.content[locale]}
                    </p>
                    <details className="release-reference">
                      <summary>Entry reference</summary>
                      <p>
                        {entry.type} · Revision {entry.revision} · <code>{entry.id}</code>
                      </p>
                    </details>
                  </li>
                ))}
            </ul>
            {snapshot.knowledge.length > 10 && (
              <div className="bot-pagination">
                <span className="small">Knowledge page {knowledgePage}</span>
                <div>
                  <Button
                    variant="quiet"
                    disabled={knowledgePage === 1}
                    onClick={() => setKnowledgePage(knowledgePage - 1)}
                  >
                    Previous entries
                  </Button>
                  <Button
                    variant="quiet"
                    disabled={knowledgePage * 10 >= snapshot.knowledge.length}
                    onClick={() => setKnowledgePage(knowledgePage + 1)}
                  >
                    Next entries
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </details>
      <section className="release-presentation" aria-labelledby="release-presentation-title">
        <h3 id="release-presentation-title">
          Presentation{snapshot.presentation ? ` · ${snapshot.presentation.name}` : ''}
        </h3>
        {!snapshot.presentation ? (
          <p className="muted">This snapshot has no selected presentation.</p>
        ) : (
          <>
            <div className="release-preview-controls">
              <div className="select-field">
                <label htmlFor="release-slide">Saved slide</label>
                <select
                  className="input"
                  id="release-slide"
                  value={slideIndex}
                  onChange={(event) => setSlideIndex(Number(event.target.value))}
                >
                  {snapshot.presentation.slides.map((value, index) => (
                    <option value={index} key={value.id}>
                      {index + 1}. {value.title[locale]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="select-field">
                <label htmlFor="release-orientation">Preview orientation</label>
                <select
                  className="input"
                  id="release-orientation"
                  value={orientation}
                  onChange={(event) => setOrientation(event.target.value)}
                >
                  <option value="landscape">Landscape · 16:9</option>
                  <option value="portrait">Portrait · 9:16</option>
                </select>
              </div>
            </div>
            <div
              className="release-slide-canvases"
              data-orientation={orientation}
              key={`${slide?.id}-${mediaAttempt}`}
            >
              <SlidePreview slide={preview} locale={locale} screen="PRIMARY" />
              <SlidePreview slide={preview} locale={locale} screen="SECONDARY" />
            </div>
            {preview?.media && (
              <Button variant="quiet" onClick={() => setMediaAttempt(mediaAttempt + 1)}>
                Reload preview media
              </Button>
            )}
            <p className="small muted">
              Orientation is a viewing option. Screen targets and durations come from the saved
              slide; videos play muted.
            </p>
          </>
        )}
      </section>
      {snapshot.media.length > 0 && (
        <details className="release-content-section">
          <summary>Media manifest · {snapshot.media.length} files</summary>
          <ul className="release-manifest">
            {snapshot.media.map((media) => (
              <li key={media.id}>
                <h4>{media.filename}</h4>
                <p className="small muted">
                  {media.width} × {media.height} · {media.byteLength.toLocaleString()} bytes
                  {media.durationSeconds ? ` · ${media.durationSeconds}s` : ''}
                </p>
                <code>{media.sha256}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
