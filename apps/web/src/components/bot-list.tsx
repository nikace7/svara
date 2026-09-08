'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '@base-ui/react/dialog';
import { Bot, Plus, Search, X } from 'lucide-react';
import { Button, FormField, StatusBadge } from '@svara/ui';
import { botCreateSchema } from '@svara/contracts';
import type { BotDetail, BotPage } from '@svara/contracts';
import { errorMessage } from '../lib/staff-api';
import { useStaffRequest, useStaffSession } from './session-provider';

function CreateBot() {
  const send = useStaffRequest();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    const parsed = botCreateSchema.safeParse({
      name: input.get('name'),
      description: input.get('description'),
    });
    if (!parsed.success) {
      setError('Enter a bot name up to 120 characters and a description up to 1,000 characters.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const bot = await send<BotDetail>('/bots', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setOpen(false);
      router.push(`/studio/bots/${bot.id}`);
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
        Create bot
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog-popup">
          <Dialog.Close
            className="button button--quiet dialog-close"
            aria-label="Close create bot"
            disabled={pending}
          >
            <X size={18} aria-hidden="true" />
          </Dialog.Close>
          <Dialog.Title className="dialog-title">Create a bot</Dialog.Title>
          <Dialog.Description className="muted">
            Give your guide a name. You can add its English and Nepali voice content next.
          </Dialog.Description>
          <form className="staff-form" onSubmit={(event) => void create(event)}>
            {error && (
              <p className="form-notice form-notice--error" role="alert">
                {error}
              </p>
            )}
            <FormField
              label="Bot name"
              name="name"
              required
              maxLength={120}
              disabled={pending}
              autoComplete="off"
            />
            <FormField
              label="Description"
              name="description"
              maxLength={1000}
              disabled={pending}
              help="A short note for your team."
            />
            <Button type="submit" disabled={pending}>
              {pending ? 'Creating…' : 'Create draft'}
            </Button>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function BotList() {
  const send = useStaffRequest();
  const { identity } = useStaffSession();
  const canAuthor = ['OWNER', 'ADMINISTRATOR'].includes(identity.membership.role);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const bots = useQuery({
    queryKey: ['bots', identity.membership.id, search, archived, page],
    queryFn: ({ signal }) =>
      send<BotPage>(
        `/bots?${new URLSearchParams({ search, includeArchived: String(archived), page: String(page) })}`,
        { signal },
      ),
    staleTime: 0,
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR VOICE, IN TWO LANGUAGES</p>
          <h1>Bots</h1>
          <p className="page-description">
            Shape how your guides introduce themselves and respond.
          </p>
        </div>
        {canAuthor && <CreateBot />}
      </div>
      {!canAuthor && (
        <p className="form-notice">
          You have view access. An owner or administrator can edit bot drafts.
        </p>
      )}
      <section className="panel bot-library" aria-label="Bot library">
        <div className="bot-toolbar">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(input.trim());
              setPage(1);
            }}
            className="bot-search"
          >
            <FormField
              label="Search bots"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={120}
              placeholder="Find a guide by name"
            />
            <Button type="submit" variant="secondary">
              <Search size={16} aria-hidden="true" />
              Search
            </Button>
          </form>
          <label className="bot-checkbox">
            <input
              type="checkbox"
              checked={archived}
              onChange={(event) => {
                setArchived(event.target.checked);
                setPage(1);
              }}
            />
            Include archived
          </label>
        </div>
        {bots.isPending ? (
          <p role="status" className="bot-empty">
            Loading bots…
          </p>
        ) : bots.isError ? (
          <div className="bot-empty">
            <p role="alert">{errorMessage(bots.error)}</p>
            <Button variant="secondary" onClick={() => void bots.refetch()}>
              Try again
            </Button>
          </div>
        ) : bots.data.items.length === 0 ? (
          <div className="bot-empty">
            <Bot size={34} aria-hidden="true" />
            <h2>{search || archived ? 'No matching bots' : 'Your first guide starts here'}</h2>
            <p>
              {search || archived
                ? 'Try another name or change the archive filter.'
                : 'Create a bot, then add its persona, greeting and fallback in both languages.'}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="bot-table">
              <caption className="sr-only">Bots in {identity.organisation.name}</caption>
              <thead>
                <tr>
                  <th scope="col">Bot</th>
                  <th scope="col">Draft</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {bots.data.items.map((bot) => (
                  <tr key={bot.id}>
                    <th scope="row">
                      <Link href={`/studio/bots/${bot.id}`}>{bot.name}</Link>
                      {bot.description && <p>{bot.description}</p>}
                    </th>
                    <td>r{bot.revision}</td>
                    <td>
                      <StatusBadge tone={bot.archivedAt ? 'neutral' : 'accent'}>
                        {bot.archivedAt ? 'Archived' : 'Draft'}
                      </StatusBadge>
                    </td>
                    <td>
                      <time dateTime={bot.updatedAt}>
                        {new Date(bot.updatedAt).toLocaleDateString()}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {bots.data && !bots.isError && (
          <div className="bot-pagination">
            <p className="small" role="status">
              {bots.data.total} {bots.data.total === 1 ? 'bot' : 'bots'} · Page {page}
            </p>
            <div>
              <Button
                variant="quiet"
                disabled={page === 1 || bots.isFetching}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="quiet"
                disabled={page * bots.data.pageSize >= bots.data.total || bots.isFetching}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </section>
      <p className="bot-footnote">
        Drafts are private to your organisation. Publication and deployment will be available after
        the remaining authoring tools are built.
      </p>
    </>
  );
}
