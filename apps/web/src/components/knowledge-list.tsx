'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '@base-ui/react/dialog';
import { ArrowLeft, BookOpen, Plus, Search, X } from 'lucide-react';
import { Button, FormField, StatusBadge } from '@svara/ui';
import { knowledgeCreateSchema } from '@svara/contracts';
import type { BotDetail, KnowledgeDetail, KnowledgePage } from '@svara/contracts';
import { errorMessage } from '../lib/staff-api';
import { useStaffRequest, useStaffSession } from './session-provider';
import { StudioLink } from './draft-navigation';
import { BotSections } from './bot-sections';

function CreateEntry({ botId }: { botId: string }) {
  const send = useStaffRequest();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = knowledgeCreateSchema.safeParse({
      title: data.get('title'),
      type: data.get('type'),
    });
    if (!parsed.success) {
      setError('Choose an entry type and a title up to 160 characters.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const entry = await send<KnowledgeDetail>(`/bots/${botId}/knowledge`, {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setOpen(false);
      router.push(`/studio/bots/${botId}/knowledge/${entry.id}`);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
          setError('');
        }
      }}
    >
      <Dialog.Trigger className="button button--primary">
        <Plus size={17} aria-hidden="true" />
        Add entry
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog-popup">
          <Dialog.Close
            className="button button--quiet dialog-close"
            disabled={pending}
            aria-label="Close add entry"
          >
            <X size={18} aria-hidden="true" />
          </Dialog.Close>
          <Dialog.Title className="dialog-title">Add knowledge</Dialog.Title>
          <Dialog.Description className="muted">
            Create an FAQ for a common question, or a reference note for supporting information.
          </Dialog.Description>
          <form className="staff-form" onSubmit={(event) => void create(event)}>
            {error && (
              <p role="alert" className="form-notice form-notice--error">
                {error}
              </p>
            )}
            <div className="select-field">
              <label htmlFor="new-entry-type">Entry type</label>
              <select
                id="new-entry-type"
                name="type"
                className="input"
                disabled={pending}
                defaultValue="FAQ"
              >
                <option value="FAQ">FAQ · Question & answer</option>
                <option value="NOTE">Reference note</option>
              </select>
            </div>
            <FormField
              label="Entry title"
              name="title"
              maxLength={160}
              required
              disabled={pending}
              help="A short title to help your team find this entry."
            />
            <Button type="submit" disabled={pending}>
              {pending ? 'Creating…' : 'Create entry'}
            </Button>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function KnowledgeList({ botId }: { botId: string }) {
  const send = useStaffRequest();
  const { identity } = useStaffSession();
  const canAuthor = ['OWNER', 'ADMINISTRATOR'].includes(identity.membership.role);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [type, setType] = useState('ALL');
  const [page, setPage] = useState(1);
  const bot = useQuery({
    queryKey: ['bot', identity.membership.id, botId],
    queryFn: ({ signal }) => send<BotDetail>(`/bots/${botId}`, { signal }),
    staleTime: 0,
  });
  const entries = useQuery({
    queryKey: ['knowledge', identity.membership.id, botId, search, status, type, page],
    queryFn: ({ signal }) =>
      send<KnowledgePage>(
        `/bots/${botId}/knowledge?${new URLSearchParams({ search, status, type, page: String(page) })}`,
        { signal },
      ),
    staleTime: 0,
  });
  if (bot.isPending) return <p role="status">Loading knowledge…</p>;
  if (bot.isError)
    return (
      <div className="panel bot-empty">
        <h1>Knowledge unavailable</h1>
        <p role="alert">{errorMessage(bot.error)}</p>
        <Button variant="secondary" onClick={() => void bot.refetch()}>
          Try again
        </Button>
      </div>
    );
  return (
    <>
      <StudioLink href="/studio/bots" className="bot-back">
        <ArrowLeft size={15} aria-hidden="true" />
        All bots
      </StudioLink>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{bot.data.name}</p>
          <h1>Knowledge</h1>
          <p className="page-description">Clear answers, reviewed in English and Nepali.</p>
        </div>
        {canAuthor && !bot.data.archivedAt && <CreateEntry botId={botId} />}
      </div>
      <BotSections id={botId} active="knowledge" />
      {bot.data.archivedAt && (
        <p className="form-notice">
          This bot is archived. Restore it in Identity before editing knowledge.
        </p>
      )}
      {!canAuthor && (
        <p className="form-notice">
          You have view access. Owners and administrators can edit and approve knowledge.
        </p>
      )}
      <section className="panel bot-library" aria-label="Knowledge entries">
        <div className="bot-toolbar knowledge-toolbar">
          <form
            className="bot-search"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(input.trim());
              setPage(1);
            }}
          >
            <FormField
              label="Search entries"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={160}
              placeholder="Search by title"
            />
            <Button type="submit" variant="secondary">
              <Search size={16} aria-hidden="true" />
              Search
            </Button>
          </form>
          <div className="knowledge-filters">
            <div className="select-field">
              <label htmlFor="knowledge-status">Review status</label>
              <select
                id="knowledge-status"
                className="input"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">All statuses</option>
                <option value="DRAFT">Needs review</option>
                <option value="APPROVED">Approved</option>
              </select>
            </div>
            <div className="select-field">
              <label htmlFor="knowledge-type">Entry type</label>
              <select
                id="knowledge-type"
                className="input"
                value={type}
                onChange={(event) => {
                  setType(event.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">All types</option>
                <option value="FAQ">FAQs</option>
                <option value="NOTE">Reference notes</option>
              </select>
            </div>
          </div>
        </div>
        {entries.isPending ? (
          <p role="status" className="bot-empty">
            Loading entries…
          </p>
        ) : entries.isError ? (
          <div className="bot-empty">
            <p role="alert">{errorMessage(entries.error)}</p>
            <Button variant="secondary" onClick={() => void entries.refetch()}>
              Try again
            </Button>
          </div>
        ) : entries.data.items.length === 0 ? (
          <div className="bot-empty">
            <BookOpen size={34} aria-hidden="true" />
            <h2>
              {search || status !== 'ALL' || type !== 'ALL'
                ? 'No matching entries'
                : 'Give your guide something to know'}
            </h2>
            <p>
              Add a common question or a useful reference. Complete both languages and approve each
              entry before publication.
            </p>
          </div>
        ) : (
          <ul className="knowledge-rows">
            {entries.data.items.map((entry) => (
              <li key={entry.id}>
                <div className="knowledge-row-title">
                  <span className="small muted">
                    {entry.type === 'FAQ' ? 'FAQ' : 'REFERENCE NOTE'} · r{entry.revision}
                  </span>
                  <StudioLink href={`/studio/bots/${botId}/knowledge/${entry.id}`}>
                    {entry.title}
                  </StudioLink>
                </div>
                <div className="knowledge-row-status">
                  <span className="small">
                    EN {entry.complete.en ? '✓' : '—'} · NE {entry.complete.ne ? '✓' : '—'}
                    <span className="sr-only">
                      {' '}
                      · English {entry.complete.en ? 'complete' : 'incomplete'}, Nepali{' '}
                      {entry.complete.ne ? 'complete' : 'incomplete'}
                    </span>
                  </span>
                  <StatusBadge tone={entry.status === 'APPROVED' ? 'success' : 'warning'}>
                    {entry.status === 'APPROVED' ? 'Approved' : 'Needs review'}
                  </StatusBadge>
                  <span className="small muted">{entry.selected ? 'Included' : 'Excluded'}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {entries.data && !entries.isError && (
          <div className="bot-pagination">
            <p className="small" role="status">
              {entries.data.total} entries · Page {page}
            </p>
            <div>
              <Button
                variant="quiet"
                disabled={page === 1 || entries.isFetching}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="quiet"
                disabled={page * entries.data.pageSize >= entries.data.total || entries.isFetching}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </section>
      <p className="bot-footnote">
        Only selected, approved entries will enter a release. Draft edits never change previously
        published content.
      </p>
    </>
  );
}
