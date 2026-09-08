'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '@base-ui/react/dialog';
import { Tabs } from '@base-ui/react/tabs';
import { ArrowLeft, Check, Save } from 'lucide-react';
import { Button, FormField, StatusBadge } from '@svara/ui';
import { knowledgeApprovalErrors, knowledgeSaveSchema } from '@svara/contracts';
import type { KnowledgeDetail, KnowledgeText } from '@svara/contracts';
import { errorMessage, StaffApiError } from '../lib/staff-api';
import { useStaffRequest, useStaffSession } from './session-provider';
import { StudioLink, useDraftDirty } from './draft-navigation';
import { BotSections } from './bot-sections';

const text = (entry: KnowledgeDetail): KnowledgeText => ({
  type: entry.type,
  title: entry.title,
  content: entry.content,
  question: entry.question,
});
type Action = 'save' | 'review' | 'selection' | 'reload' | 'delete';

function TextField({
  id,
  label,
  locale,
  value,
  limit,
  rows,
  error,
  onChange,
}: {
  id: string;
  label: string;
  locale: string;
  value: string;
  limit: number;
  rows: number;
  error: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        lang={locale}
        className="input"
        value={value}
        maxLength={limit}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

function EntryForm({ initial }: { initial: KnowledgeDetail }) {
  const send = useStaffRequest();
  const router = useRouter();
  const { identity } = useStaffSession();
  const canAuthor = ['OWNER', 'ADMINISTRATOR'].includes(identity.membership.role);
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(text(initial));
  const [locale, setLocale] = useState<'en' | 'ne'>('en');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<'delete' | 'reload' | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(text(saved));
  useDraftDirty(dirty);
  const disabled = !canAuthor || !!saved.botArchivedAt || pending;
  const missing = knowledgeApprovalErrors(form);
  const complete = (language: 'en' | 'ne') =>
    !missing[`content.${language}`] && !missing[`question.${language}`];
  function update(next: KnowledgeText) {
    setForm(next);
    setNotice('');
    setError('');
    setFields({});
  }
  async function perform(action: Action) {
    const parsed =
      action === 'save'
        ? knowledgeSaveSchema.safeParse({ ...form, expectedRevision: saved.revision })
        : undefined;
    if (parsed && !parsed.success) {
      setError('Check the title and field lengths before saving.');
      setFields(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join('.'), [issue.message]]),
        ),
      );
      return;
    }
    setPending(true);
    setNotice('');
    setError('');
    setFields({});
    try {
      const suffix = action === 'review' ? '/approval' : action === 'selection' ? '/selection' : '';
      const method =
        action === 'reload'
          ? 'GET'
          : action === 'save'
            ? 'PATCH'
            : action === 'delete'
              ? 'DELETE'
              : 'POST';
      const body =
        action === 'save' && parsed?.success
          ? parsed.data
          : {
              expectedRevision: saved.revision,
              ...(action === 'review' ? { approved: saved.status !== 'APPROVED' } : {}),
              ...(action === 'selection' ? { selected: !saved.selected } : {}),
            };
      if (action === 'delete') {
        await send(`/knowledge/${saved.id}`, { method, body: JSON.stringify(body) });
        setConfirm(null);
        router.push(`/studio/bots/${saved.botId}/knowledge`);
        return;
      }
      const entry = await send<KnowledgeDetail>(
        `/knowledge/${saved.id}${suffix}`,
        action === 'reload' ? {} : { method, body: JSON.stringify(body) },
      );
      setSaved(entry);
      setForm(text(entry));
      setConflict(false);
      setConfirm(null);
      setNotice(
        action === 'save'
          ? 'Entry saved · Review required.'
          : action === 'reload'
            ? 'Latest entry loaded.'
            : action === 'review'
              ? entry.status === 'APPROVED'
                ? 'Entry approved.'
                : 'Entry returned to draft.'
              : entry.selected
                ? 'Entry included in the next release.'
                : 'Entry excluded from the next release.',
      );
    } catch (failure) {
      setError(errorMessage(failure));
      if (failure instanceof StaffApiError) {
        setFields(failure.fieldErrors);
        setConflict(['REVISION_CONFLICT', 'ARCHIVED'].includes(failure.code));
      }
      setConfirm(null);
    } finally {
      setPending(false);
    }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void perform('save');
  }
  return (
    <>
      <StudioLink className="bot-back" href={`/studio/bots/${saved.botId}/knowledge`}>
        <ArrowLeft size={15} aria-hidden="true" />
        All entries
      </StudioLink>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {saved.type === 'FAQ' ? 'FREQUENTLY ASKED QUESTION' : 'REFERENCE NOTE'}
          </p>
          <h1>{saved.title}</h1>
          <p className="page-description">Useful information, ready for a careful review.</p>
        </div>
        <StatusBadge tone={saved.status === 'APPROVED' ? 'success' : 'warning'}>
          {saved.status === 'APPROVED' ? 'Approved' : 'Needs review'}
        </StatusBadge>
      </div>
      <BotSections id={saved.botId} active="knowledge" />
      {!canAuthor && (
        <p className="form-notice">
          You have view access. An owner or administrator can edit and approve this entry.
        </p>
      )}
      {saved.botArchivedAt && (
        <p className="form-notice">
          This bot is archived. Restore it in Identity before changing knowledge.
        </p>
      )}
      {error && (
        <div className="form-notice form-notice--error knowledge-error">
          <p role="alert">{error}</p>
          {Object.keys(fields).length > 0 && (
            <ul>
              {Object.entries(fields).map(([key, messages]) => (
                <li key={key}>{messages[0]}</li>
              ))}
            </ul>
          )}
          {conflict && (
            <Button variant="secondary" disabled={pending} onClick={() => setConfirm('reload')}>
              Load latest version
            </Button>
          )}
        </div>
      )}
      <form onSubmit={save} className="bot-editor">
        <section className="panel bot-section" aria-labelledby="entry-content-title">
          <h2 id="entry-content-title">Entry content</h2>
          <p className="muted small">Plain text only. Add facts your team has checked.</p>
          <fieldset disabled={disabled} className="bot-fields knowledge-title-field">
            <legend className="sr-only">Entry title</legend>
            <FormField
              label="Entry title"
              required
              value={form.title}
              onChange={(event) => update({ ...form, title: event.target.value })}
              maxLength={160}
              error={fields.title?.[0]}
              help="An internal title for your team."
            />
          </fieldset>
          <Tabs.Root
            value={locale}
            onValueChange={(value) => setLocale(value === 'ne' ? 'ne' : 'en')}
          >
            <Tabs.List className="bot-language-tabs" aria-label="Knowledge language">
              <Tabs.Tab className="bot-language-tab" value="en">
                English <span>{complete('en') ? 'Complete' : 'Incomplete'}</span>
              </Tabs.Tab>
              <Tabs.Tab className="bot-language-tab" value="ne">
                Nepali · <span lang="ne">नेपाली</span>{' '}
                <span>{complete('ne') ? 'Complete' : 'Incomplete'}</span>
              </Tabs.Tab>
            </Tabs.List>
            {(['en', 'ne'] as const).map((language) => (
              <Tabs.Panel key={language} value={language}>
                <fieldset disabled={disabled} className="bot-fields">
                  <legend className="sr-only">
                    {language === 'en' ? 'English' : 'Nepali'} entry text
                  </legend>
                  {form.type === 'FAQ' && (
                    <TextField
                      id={`entry-question-${language}`}
                      label="Question"
                      locale={language}
                      value={form.question[language]}
                      limit={500}
                      rows={3}
                      error={fields[`question.${language}`]?.[0]}
                      onChange={(value) =>
                        update({ ...form, question: { ...form.question, [language]: value } })
                      }
                    />
                  )}
                  <TextField
                    id={`entry-content-${language}`}
                    label={form.type === 'FAQ' ? 'Answer' : 'Reference content'}
                    locale={language}
                    value={form.content[language]}
                    limit={8000}
                    rows={10}
                    error={fields[`content.${language}`]?.[0]}
                    onChange={(value) =>
                      update({ ...form, content: { ...form.content, [language]: value } })
                    }
                  />
                </fieldset>
              </Tabs.Panel>
            ))}
          </Tabs.Root>
        </section>
        <aside className="bot-editor-aside" aria-label="Knowledge review and inclusion">
          <section className="panel bot-section knowledge-review">
            <h2>Review</h2>
            <p className="muted small">
              Check both translations for accuracy before approving this entry.
            </p>
            <ul className="knowledge-checklist">
              {(['en', 'ne'] as const).map((language) => (
                <li key={language}>
                  <span>{language === 'en' ? 'English' : 'Nepali'}</span>
                  <StatusBadge tone={complete(language) ? 'success' : 'warning'}>
                    {complete(language) ? 'Complete' : 'Incomplete'}
                  </StatusBadge>
                </li>
              ))}
            </ul>
            {saved.approvedAt && (
              <p className="small muted">
                Approved{' '}
                <time dateTime={saved.approvedAt}>
                  {new Date(saved.approvedAt).toLocaleDateString()}
                </time>
              </p>
            )}
            {canAuthor && (
              <Button
                type="button"
                disabled={disabled || dirty}
                onClick={() => void perform('review')}
              >
                <Check size={16} aria-hidden="true" />
                {saved.status === 'APPROVED' ? 'Return to draft' : 'Approve entry'}
              </Button>
            )}
            <p className="bot-footnote">
              {dirty
                ? 'Save your changes before reviewing. Editing approved text requires a new approval.'
                : 'Approval records the version you reviewed. It does not publish the bot.'}
            </p>
          </section>
          <section className="panel bot-section knowledge-review">
            <h2>Release inclusion</h2>
            <StatusBadge tone={saved.selected ? 'accent' : 'neutral'}>
              {saved.selected ? 'Included' : 'Excluded'}
            </StatusBadge>
            <p className="muted small">
              {saved.selected
                ? 'This entry is selected for the next release. It must be approved before publishing.'
                : 'This entry stays in your library and will be left out of the next release.'}
            </p>
            {canAuthor && (
              <Button
                type="button"
                variant="secondary"
                disabled={disabled || dirty}
                onClick={() => void perform('selection')}
              >
                {saved.selected ? 'Exclude from release' : 'Include in release'}
              </Button>
            )}
          </section>
          {canAuthor && (
            <div className="knowledge-delete">
              <Button
                type="button"
                variant="quiet"
                disabled={disabled || dirty}
                onClick={() => setConfirm('delete')}
              >
                Delete entry
              </Button>
              <p className="small muted">Remove this entry from the draft library.</p>
            </div>
          )}
        </aside>
        <div className="bot-savebar">
          <div>
            <p role="status">
              {notice ||
                (dirty ? 'Unsaved changes' : `Revision ${saved.revision} · All changes saved`)}
            </p>
            <span className="small muted">Save incomplete drafts as you go.</span>
          </div>
          {canAuthor && (
            <Button type="submit" disabled={disabled || !dirty}>
              <Save size={16} aria-hidden="true" />
              {pending ? 'Working…' : 'Save entry'}
            </Button>
          )}
        </div>
      </form>
      <Dialog.Root
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirm(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="dialog-backdrop" />
          <Dialog.Popup className="dialog-popup">
            <Dialog.Title className="dialog-title">
              {confirm === 'delete' ? 'Delete this entry?' : 'Load the latest entry?'}
            </Dialog.Title>
            <Dialog.Description className="muted">
              {confirm === 'delete'
                ? 'This removes the entry from the draft library. You cannot undo this action.'
                : 'This discards your local edits and loads the latest saved version. Copy anything you want to keep before continuing.'}
            </Dialog.Description>
            <div className="dialog-actions">
              <Dialog.Close className="button button--secondary" disabled={pending}>
                Cancel
              </Dialog.Close>
              <Button
                disabled={pending}
                onClick={() => void perform(confirm === 'delete' ? 'delete' : 'reload')}
              >
                {pending
                  ? 'Working…'
                  : confirm === 'delete'
                    ? 'Delete entry'
                    : 'Discard edits and load'}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

export function KnowledgeEditor({ botId, entryId }: { botId: string; entryId: string }) {
  const send = useStaffRequest();
  const { identity } = useStaffSession();
  const entry = useQuery({
    queryKey: ['knowledge-entry', identity.membership.id, entryId],
    queryFn: ({ signal }) => send<KnowledgeDetail>(`/knowledge/${entryId}`, { signal }),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 0,
  });
  if (entry.isPending || entry.isFetching) return <p role="status">Loading entry…</p>;
  if (entry.isError || entry.data.botId !== botId)
    return (
      <div className="panel bot-empty">
        <h1>Entry unavailable</h1>
        <p role="alert">
          {entry.isError ? errorMessage(entry.error) : 'Entry not found in this bot.'}
        </p>
        <Button variant="secondary" onClick={() => void entry.refetch()}>
          Try again
        </Button>
        <StudioLink className="bot-back" href={`/studio/bots/${botId}/knowledge`}>
          All entries
        </StudioLink>
      </div>
    );
  return <EntryForm key={`${entry.data.id}:${entry.data.revision}`} initial={entry.data} />;
}
