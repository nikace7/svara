'use client';

import { useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { ArrowLeft, Presentation } from 'lucide-react';
import { Button } from '@svara/ui';
import { PRESENTATION_LIMITS } from '@svara/contracts';
import type { BotDetail, PresentationDetail, PresentationList } from '@svara/contracts';
import { errorMessage } from '../lib/staff-api';
import { useStaffRequest, useStaffSession } from './session-provider';
import { StudioLink } from './draft-navigation';
import { BotSections } from './bot-sections';
import { PresentationNameDialog } from './presentation-name-dialog';
import { PresentationEditor } from './presentation-editor';

export function PresentationWorkspace({ botId }: { botId: string }) {
  const send = useStaffRequest();
  const { identity } = useStaffSession();
  const client = useQueryClient();
  const [chosen, setChosen] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const listKey = ['presentations', identity.membership.id, botId];
  const bot = useQuery({
    queryKey: ['bot', identity.membership.id, botId],
    queryFn: ({ signal }) => send<BotDetail>(`/bots/${botId}`, { signal }),
    staleTime: 0,
  });
  const list = useQuery({
    queryKey: listKey,
    queryFn: ({ signal }) => send<PresentationList>(`/presentations?botId=${botId}`, { signal }),
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const id =
    list.data?.items.find((item) => item.id === chosen)?.id ??
    list.data?.selectedPresentationId ??
    list.data?.items[0]?.id ??
    null;
  const detail = useQuery({
    queryKey: ['presentation', identity.membership.id, id],
    queryFn: ({ signal }) => send<PresentationDetail>(`/presentations/${id}`, { signal }),
    enabled: !!id,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  function saved(value: PresentationDetail) {
    client.setQueryData<PresentationList>(
      listKey,
      (current) =>
        current && {
          ...current,
          botRevision: value.botRevision,
          botArchivedAt: value.botArchivedAt,
          selectedPresentationId: value.selected
            ? value.id
            : current.selectedPresentationId === value.id
              ? null
              : current.selectedPresentationId,
          items: current.items.some((item) => item.id === value.id)
            ? current.items.map((item) => (item.id === value.id ? value : item))
            : [...current.items, value],
        },
    );
    client.setQueryData(['presentation', identity.membership.id, value.id], value);
  }
  const canAuthor = ['OWNER', 'ADMINISTRATOR'].includes(identity.membership.role);
  if (bot.isPending || list.isPending) return <p role="status">Loading presentations…</p>;
  if (bot.isError || list.isError)
    return (
      <div className="panel bot-empty">
        <h1>Presentations unavailable</h1>
        <p role="alert">{errorMessage(bot.error ?? list.error)}</p>
        <Button
          variant="secondary"
          onClick={() => {
            void bot.refetch();
            void list.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  const editable = canAuthor && !list.data.botArchivedAt;
  return (
    <>
      <StudioLink href="/studio/bots" className="bot-back">
        <ArrowLeft size={15} aria-hidden="true" />
        All bots
      </StudioLink>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{bot.data.name}</p>
          <h1>Presentation</h1>
          <p className="page-description">
            Supporting visuals, in both languages and on both screens.
          </p>
        </div>
        {editable && (
          <PresentationNameDialog
            disabled={locked || list.data.items.length >= PRESENTATION_LIMITS.perBot}
            onSave={async (name) => {
              const created = await send<PresentationDetail>('/presentations', {
                method: 'POST',
                body: JSON.stringify({ botId, name }),
              });
              saved(created);
              setChosen(created.id);
            }}
          />
        )}
      </div>
      <BotSections id={botId} active="presentation" />
      {!canAuthor && (
        <p className="form-notice">
          You have view access. Owners and administrators can edit presentations.
        </p>
      )}
      {list.data.botArchivedAt && (
        <p className="form-notice">
          This bot is archived. Restore it in Identity before editing presentations.
        </p>
      )}
      {list.data.items.length === 0 ? (
        <section className="panel bot-empty">
          <Presentation size={34} aria-hidden="true" />
          <h2>Give your guide a visual story</h2>
          <p>
            Create a presentation, then add text, images and muted videos. You can keep up to 20
            presentations and select one for this bot.
          </p>
        </section>
      ) : (
        <>
          <div className="presentation-switcher select-field">
            <label htmlFor="presentation-choice">Presentation to edit</label>
            <select
              id="presentation-choice"
              className="input"
              value={id ?? ''}
              disabled={locked}
              onChange={(event) => setChosen(event.target.value)}
            >
              {list.data.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {list.data.selectedPresentationId === item.id ? ' · Selected' : ''}
                </option>
              ))}
            </select>
          </div>
          {detail.isPending || detail.isFetching ? (
            <p role="status">Loading slides…</p>
          ) : detail.isError ? (
            <div>
              <p role="alert">{errorMessage(detail.error)}</p>
              <Button onClick={() => void detail.refetch()}>Try again</Button>
            </div>
          ) : (
            <PresentationEditor
              key={detail.data.id}
              initial={detail.data}
              canAuthor={canAuthor}
              onLock={setLocked}
              onSaved={saved}
              onRemoved={(revision) => {
                client.setQueryData<PresentationList>(
                  listKey,
                  (current) =>
                    current && {
                      ...current,
                      botRevision: revision,
                      selectedPresentationId:
                        current.selectedPresentationId === id
                          ? null
                          : current.selectedPresentationId,
                      items: current.items.filter((item) => item.id !== id),
                    },
                );
                setChosen(null);
              }}
            />
          )}
        </>
      )}
    </>
  );
}
