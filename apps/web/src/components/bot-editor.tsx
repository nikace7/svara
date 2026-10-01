'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '@base-ui/react/dialog';
import { Tabs } from '@base-ui/react/tabs';
import { ArrowLeft, Save } from 'lucide-react';
import { Button, FormField, StatusBadge } from '@svara/ui';
import { botSaveSchema, botToolSchema } from '@svara/contracts';
import type { BotDetail, BotDraft } from '@svara/contracts';
import { errorMessage, StaffApiError } from '../lib/staff-api';
import { useStaffRequest, useStaffSession } from './session-provider';
import { StudioLink, useDraftDirty } from './draft-navigation';
import { BotSections } from './bot-sections';

const toolLabels = {
  lookup_knowledge: 'Search approved knowledge',
  get_event_schedule: 'Read event schedules',
  select_reference: 'Show a reference',
  show_slide: 'Show a presentation slide',
};
const values = (bot: BotDetail) => ({
  name: bot.name,
  description: bot.description,
  draft: bot.draft,
});

function DraftForm({ initial }: { initial: BotDetail }) {
  const send = useStaffRequest();
  const { identity } = useStaffSession();
  const canAuthor = ['OWNER', 'ADMINISTRATOR'].includes(identity.membership.role);
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(values(initial));
  const [locale, setLocale] = useState<'en' | 'ne'>('en');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<'archive' | 'reload' | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(values(saved));
  useDraftDirty(dirty);
  const disabled = !canAuthor || !!saved.archivedAt || pending;
  function updateDraft(patch: Partial<BotDraft>) {
    setForm((current) => ({ ...current, draft: { ...current.draft, ...patch } }));
    setNotice('');
  }
  async function perform(action: 'save' | 'archive' | 'restore' | 'reload') {
    const parsed =
      action === 'save'
        ? botSaveSchema.safeParse({ ...form, expectedRevision: saved.revision })
        : undefined;
    if (parsed && !parsed.success) {
      setError('Check the name and field lengths before saving.');
      return;
    }
    setPending(true);
    setError('');
    setNotice('');
    try {
      const bot = await send<BotDetail>(
        `/bots/${saved.id}${action === 'archive' || action === 'restore' ? '/archive' : ''}`,
        action === 'reload'
          ? {}
          : {
              method: action === 'save' ? 'PATCH' : 'POST',
              body: JSON.stringify(
                action === 'save' && parsed?.success
                  ? parsed.data
                  : { expectedRevision: saved.revision, archived: action === 'archive' },
              ),
            },
      );
      setSaved(bot);
      setForm(values(bot));
      setConflict(false);
      setConfirm(null);
      setNotice(
        action === 'save'
          ? `Draft saved · Revision ${bot.revision}`
          : action === 'reload'
            ? 'Latest draft loaded.'
            : action === 'archive'
              ? 'Bot archived.'
              : 'Bot restored.',
      );
    } catch (failure) {
      setError(errorMessage(failure));
      setConflict(
        failure instanceof StaffApiError &&
          ['REVISION_CONFLICT', 'ARCHIVED'].includes(failure.code),
      );
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
      <StudioLink href="/studio/bots" className="bot-back">
        <ArrowLeft size={15} aria-hidden="true" />
        All bots
      </StudioLink>
      <div className="page-heading bot-heading">
        <div>
          <p className="eyebrow">BOT IDENTITY</p>
          <h1>{saved.name}</h1>
          <p className="page-description">A consistent voice for every conversation.</p>
        </div>
        <StatusBadge tone={saved.archivedAt ? 'neutral' : 'accent'}>
          {saved.archivedAt ? 'Archived' : `Draft · r${saved.revision}`}
        </StatusBadge>
      </div>
      <BotSections id={saved.id} active="identity" />
      {!canAuthor && (
        <p className="form-notice">
          You have view access. Ask an owner or administrator to update this draft.
        </p>
      )}
      {saved.archivedAt && (
        <p className="form-notice">
          This bot is archived. Its draft is preserved and can be restored.
        </p>
      )}
      {error && (
        <div className="form-notice form-notice--error bot-error">
          <p role="alert">{error}</p>
          {conflict && (
            <Button variant="secondary" disabled={pending} onClick={() => setConfirm('reload')}>
              Load latest version
            </Button>
          )}
        </div>
      )}
      <form onSubmit={save} className="bot-editor">
        <div className="bot-editor-main">
          <section className="panel bot-section" aria-labelledby="identity-title">
            <div className="bot-section-heading">
              <span className="bot-section-number">01</span>
              <div>
                <h2 id="identity-title">Identity & persona</h2>
                <p>Name your guide and describe how it should speak.</p>
              </div>
            </div>
            <fieldset disabled={disabled} className="bot-fields">
              <legend className="sr-only">Identity fields</legend>
              <FormField
                label="Bot name"
                required
                maxLength={120}
                value={form.name}
                onChange={(event) => {
                  setForm({ ...form, name: event.target.value });
                  setNotice('');
                }}
              />
              <FormField
                label="Description"
                maxLength={1000}
                value={form.description}
                onChange={(event) => {
                  setForm({ ...form, description: event.target.value });
                  setNotice('');
                }}
                help="An internal description for your team."
              />
              <div className="field">
                <label htmlFor="bot-persona">Persona</label>
                <p id="persona-help" className="field-help">
                  Tone, role and speaking style. Keep factual answers in approved knowledge.
                </p>
                <textarea
                  id="bot-persona"
                  className="input"
                  rows={5}
                  maxLength={4000}
                  value={form.draft.persona}
                  onChange={(event) => updateDraft({ persona: event.target.value })}
                  aria-describedby="persona-help"
                />
              </div>
            </fieldset>
          </section>
          <section className="panel bot-section" aria-labelledby="voice-content-title">
            <div className="bot-section-heading">
              <span className="bot-section-number">02</span>
              <div>
                <h2 id="voice-content-title">Greeting & fallback</h2>
                <p>Welcome visitors and help them when an answer is unavailable.</p>
              </div>
            </div>
            <Tabs.Root
              value={locale}
              onValueChange={(value) => setLocale(value === 'ne' ? 'ne' : 'en')}
            >
              <Tabs.List className="bot-language-tabs" aria-label="Content language">
                <Tabs.Tab value="en" className="bot-language-tab">
                  English{' '}
                  <span>
                    {form.draft.greeting.en.trim() && form.draft.fallback.en.trim()
                      ? '2/2'
                      : `${Number(!!form.draft.greeting.en.trim()) + Number(!!form.draft.fallback.en.trim())}/2`}
                  </span>
                </Tabs.Tab>
                <Tabs.Tab value="ne" className="bot-language-tab">
                  Nepali · <span lang="ne">नेपाली</span>{' '}
                  <span>
                    {Number(!!form.draft.greeting.ne.trim()) +
                      Number(!!form.draft.fallback.ne.trim())}
                    /2
                  </span>
                </Tabs.Tab>
              </Tabs.List>
              {(['en', 'ne'] as const).map((language) => (
                <Tabs.Panel key={language} value={language} className="bot-language-panel">
                  <fieldset disabled={disabled} className="bot-fields">
                    <legend className="sr-only">
                      {language === 'en' ? 'English' : 'Nepali'} content
                    </legend>
                    <div className="field">
                      <label htmlFor={`greeting-${language}`}>Greeting</label>
                      <textarea
                        id={`greeting-${language}`}
                        lang={language}
                        className="input"
                        rows={4}
                        maxLength={2000}
                        value={form.draft.greeting[language]}
                        onChange={(event) =>
                          updateDraft({
                            greeting: { ...form.draft.greeting, [language]: event.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`fallback-${language}`}>Fallback</label>
                      <textarea
                        id={`fallback-${language}`}
                        lang={language}
                        className="input"
                        rows={4}
                        maxLength={2000}
                        value={form.draft.fallback[language]}
                        onChange={(event) =>
                          updateDraft({
                            fallback: { ...form.draft.fallback, [language]: event.target.value },
                          })
                        }
                      />
                    </div>
                  </fieldset>
                </Tabs.Panel>
              ))}
            </Tabs.Root>
          </section>
        </div>
        <aside className="bot-editor-aside" aria-label="Voice and tool settings">
          <section className="panel bot-section">
            <h2>Voice choices</h2>
            <p className="muted small">Choose the voices to use when live speech is enabled.</p>
            <fieldset disabled={disabled} className="bot-fields">
              <legend className="sr-only">Voice settings</legend>
              <div className="select-field">
                <label htmlFor="voice-en">English voice</label>
                <select
                  id="voice-en"
                  className="input"
                  value={form.draft.voiceEn}
                  onChange={() => {}}
                >
                  <option value="en-US-JennyNeural">Jenny · English (US)</option>
                </select>
              </div>
              <div className="select-field">
                <label htmlFor="voice-ne">Nepali voice</label>
                <select
                  id="voice-ne"
                  className="input"
                  value={form.draft.voiceNe}
                  onChange={(event) =>
                    updateDraft({
                      voiceNe:
                        event.target.value === 'ne-NP-SagarNeural'
                          ? 'ne-NP-SagarNeural'
                          : 'ne-NP-HemkalaNeural',
                    })
                  }
                >
                  <option value="ne-NP-HemkalaNeural">Hemkala · Nepali</option>
                  <option value="ne-NP-SagarNeural">Sagar · Nepali</option>
                </select>
              </div>
            </fieldset>
            <p className="bot-footnote">
              Saved with the draft, but live speech uses the server&rsquo;s single Gemini voice for
              now. No audio is generated when saving a draft.
            </p>
          </section>
          <section className="panel bot-section">
            <h2>Permitted tools</h2>
            <p className="muted small">Set which actions this bot may use once published.</p>
            <fieldset disabled={disabled} className="bot-tools">
              <legend className="sr-only">Permitted tools</legend>
              {botToolSchema.options.map((tool) => (
                <label key={tool} className="bot-checkbox">
                  <input
                    type="checkbox"
                    checked={form.draft.tools.includes(tool)}
                    onChange={(event) =>
                      updateDraft({
                        tools: event.target.checked
                          ? [...form.draft.tools, tool]
                          : form.draft.tools.filter((value) => value !== tool),
                      })
                    }
                  />
                  {toolLabels[tool]}
                </label>
              ))}
            </fieldset>
          </section>
          <div className="bot-draft-note">
            <StatusBadge tone="neutral">Private draft</StatusBadge>
            <p>
              Save incomplete content as you go. Publishing will require complete English and Nepali
              content.
            </p>
          </div>
        </aside>
        <div className="bot-savebar">
          <div>
            <p role="status">
              {notice ||
                (dirty ? 'Unsaved changes' : `Revision ${saved.revision} · All changes saved`)}
            </p>
            <span className="small muted">Changes stay in this draft until published.</span>
          </div>
          {canAuthor && (
            <div className="bot-save-actions">
              <Button
                type="button"
                variant="quiet"
                disabled={pending || dirty}
                onClick={() => (saved.archivedAt ? void perform('restore') : setConfirm('archive'))}
              >
                {saved.archivedAt ? 'Restore bot' : 'Archive bot'}
              </Button>
              <Button type="submit" disabled={disabled || !dirty}>
                <Save size={16} aria-hidden="true" />
                {pending ? 'Working…' : 'Save draft'}
              </Button>
            </div>
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
              {confirm === 'reload' ? 'Load the latest draft?' : 'Archive this bot?'}
            </Dialog.Title>
            <Dialog.Description className="muted">
              {confirm === 'reload'
                ? 'This discards your local edits and loads the latest saved version. Copy anything you want to keep before continuing.'
                : 'The bot will leave the active list. Its draft will be preserved and you can restore it later.'}
            </Dialog.Description>
            <div className="dialog-actions">
              <Dialog.Close disabled={pending} className="button button--secondary">
                Cancel
              </Dialog.Close>
              <Button
                disabled={pending}
                onClick={() => void perform(confirm === 'reload' ? 'reload' : 'archive')}
              >
                {pending
                  ? 'Working…'
                  : confirm === 'reload'
                    ? 'Discard edits and load'
                    : 'Archive bot'}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

export function BotEditor({ id }: { id: string }) {
  const send = useStaffRequest();
  const { identity } = useStaffSession();
  const bot = useQuery({
    queryKey: ['bot', identity.membership.id, id],
    queryFn: ({ signal }) => send<BotDetail>(`/bots/${id}`, { signal }),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 0,
  });
  if (bot.isPending || bot.isFetching) return <p role="status">Loading draft…</p>;
  if (bot.isError)
    return (
      <div className="panel bot-empty">
        <h1>Draft unavailable</h1>
        <p role="alert">{errorMessage(bot.error)}</p>
        <Button variant="secondary" onClick={() => void bot.refetch()}>
          Try again
        </Button>
        <StudioLink href="/studio/bots" className="bot-back">
          All bots
        </StudioLink>
      </div>
    );
  return <DraftForm key={`${bot.data.id}:${bot.data.revision}`} initial={bot.data} />;
}
