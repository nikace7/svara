'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Button, FormField } from '@svara/ui';
import { releaseSearchResultSchema, releaseSearchSchema } from '@svara/contracts';
import type { ReleaseDetail, ReleaseSearchResult } from '@svara/contracts';
import { errorMessage, StaffApiError } from '../lib/staff-api';
import { useStaffRequest } from './session-provider';

export function ReleaseQuery({ release }: { release: ReleaseDetail }) {
  const send = useStaffRequest();
  const [locale, setLocale] = useState<'en' | 'ne'>('en');
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [result, setResult] = useState<ReleaseSearchResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (!release.previewExpiresAt) return;
    const timer = setTimeout(
      () => {
        active.current?.abort();
        setPending(false);
        setExpired(true);
      },
      Math.max(0, Date.parse(release.previewExpiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [release.previewExpiresAt]);

  async function search() {
    const parsed = releaseSearchSchema.safeParse({ locale, query: input });
    if (!parsed.success) {
      setError('Enter a question of up to 500 characters without unsupported control characters.');
      return;
    }
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError('');
    setResult(null);
    setSubmitted(input.trim());
    try {
      const found = releaseSearchResultSchema.parse(
        await send<unknown>(`/releases/${release.id}/knowledge/query`, {
          method: 'POST',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
          body: JSON.stringify(parsed.data),
        }),
      );
      if (controller.signal.aborted || active.current !== controller) return;
      if (
        found.releaseId !== release.id ||
        found.snapshotHash !== release.snapshotHash ||
        found.locale !== parsed.data.locale
      ) {
        setError('The returned content did not match this saved release. Try again.');
        return;
      }
      setResult(found);
    } catch (failure) {
      if (controller.signal.aborted || active.current !== controller) return;
      if (failure instanceof StaffApiError && failure.code === 'PREVIEW_EXPIRED') setExpired(true);
      else setError(errorMessage(failure));
    } finally {
      if (active.current === controller) setPending(false);
    }
  }
  return (
    <section className="release-query" aria-labelledby="release-query-title">
      <div className="release-section-heading">
        <h3 id="release-query-title">
          <Search size={17} aria-hidden="true" />
          Inspect knowledge
        </h3>
        <span className="release-badge">Saved content only</span>
      </div>
      <p className="muted small">
        See which passages this version retrieves. This inspection does not generate an AI answer or
        call an external provider.
      </p>
      {expired && (
        <p role="status" className="form-notice">
          This preview has expired for new queries. Create a new preview to test the current draft.
          Its saved content remains available below.
        </p>
      )}
      <form
        className="release-query-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!expired && !pending) void search();
        }}
      >
        <div className="select-field">
          <label htmlFor="release-query-language">Query language</label>
          <select
            id="release-query-language"
            className="input"
            value={locale}
            onChange={(event) => {
              active.current?.abort();
              setLocale(event.target.value as typeof locale);
              setResult(null);
              setError('');
              setPending(false);
            }}
          >
            <option value="en">English</option>
            <option value="ne">Nepali / नेपाली</option>
          </select>
        </div>
        <FormField
          label="Question to inspect"
          value={input}
          maxLength={500}
          required
          disabled={expired}
          onChange={(event) => setInput(event.target.value)}
        />
        <Button type="submit" pending={pending} disabled={expired || !input.trim()}>
          Search knowledge
        </Button>
      </form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {pending && <p role="status">Searching this release…</p>}
      {result && (
        <section className="release-results" aria-label="Knowledge results">
          <p className="small" role="status">
            {result.passages.length} matching{' '}
            {result.passages.length === 1 ? 'passage' : 'passages'}
          </p>
          <p className="muted small">
            For: <span lang={result.locale}>{submitted}</span>
          </p>
          {result.passages.length === 0 ? (
            <div className="release-fallback">
              <p>No matching knowledge was found. This version’s saved fallback is:</p>
              <p lang={result.locale}>{release.snapshot.bot.config.fallback[result.locale]}</p>
            </div>
          ) : (
            <ol>
              {result.passages.map((passage) => (
                <li key={passage.entryId}>
                  <h4>{passage.title}</h4>
                  {passage.question && (
                    <p lang={result.locale} className="release-question">
                      {passage.question}
                    </p>
                  )}
                  <p lang={result.locale} className="release-text">
                    {passage.text}
                  </p>
                  <details className="release-reference">
                    <summary>
                      Passage reference{passage.truncated ? ' · Excerpt shortened' : ''}
                    </summary>
                    <p>
                      Entry <code>{passage.entryId}</code> · Match score {passage.score.toFixed(3)}
                    </p>
                  </details>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </section>
  );
}
