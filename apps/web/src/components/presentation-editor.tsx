'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Tabs } from '@base-ui/react/tabs';
import { ArrowDown, ArrowUp, Plus, Save } from 'lucide-react';
import { Button, FormField, StatusBadge } from '@svara/ui';
import { PRESENTATION_LIMITS, slideSaveSchema, slideTranslationErrors } from '@svara/contracts';
import type { PresentationDetail, PresentationSelection, SlideDetail } from '@svara/contracts';
import { errorMessage } from '../lib/staff-api';
import { useStaffRequest } from './session-provider';
import { useDraftDirty } from './draft-navigation';
import { PresentationNameDialog } from './presentation-name-dialog';
import { PresentationMediaPicker, SlidePreview } from './presentation-media';

function slideFields(slide: SlideDetail) {
  return {
    title: slide.title,
    body: slide.body,
    mediaId: slide.mediaId,
    target: slide.target,
    durationSeconds: slide.durationSeconds,
  };
}

export function PresentationEditor({
  initial,
  canAuthor,
  onLock,
  onSaved,
  onRemoved,
}: {
  initial: PresentationDetail;
  canAuthor: boolean;
  onLock: (locked: boolean) => void;
  onSaved: (value: PresentationDetail) => void;
  onRemoved: (botRevision: number) => void;
}) {
  const send = useStaffRequest();
  // Saved snapshots are replaced only by an explicit successful action, never a background refetch.
  const [snapshot, setSnapshot] = useState(initial);
  const [draft, setDraft] = useState<SlideDetail | null>(initial.slides[0] ?? null);
  const [order, setOrder] = useState(initial.slides.map((slide) => slide.id));
  const [locale, setLocale] = useState<'en' | 'ne'>('en');
  const [previewLocale, setPreviewLocale] = useState<'en' | 'ne'>('en');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'reload' | 'slide' | 'presentation' | null>(null);
  const original = snapshot.slides.find((slide) => slide.id === draft?.id);
  const slideDirty =
    !!draft &&
    !!original &&
    JSON.stringify(slideFields(draft)) !== JSON.stringify(slideFields(original));
  const orderDirty = order.join(',') !== snapshot.slides.map((slide) => slide.id).join(',');
  const dirty = slideDirty || orderDirty;
  const editable = canAuthor && !snapshot.botArchivedAt;
  const disabled = !editable || pending;
  const position = draft ? order.indexOf(draft.id) : -1;
  useDraftDirty(dirty);
  useEffect(() => {
    onLock(dirty || pending);
    return () => onLock(false);
  }, [dirty, pending, onLock]);

  function accept(value: PresentationDetail, selection = draft?.id) {
    setSnapshot(value);
    setOrder(value.slides.map((slide) => slide.id));
    setDraft(value.slides.find((slide) => slide.id === selection) ?? value.slides[0] ?? null);
    onSaved(value);
  }
  async function perform(operation: () => Promise<void>, message: string) {
    setPending(true);
    setError('');
    setNotice('');
    try {
      await operation();
      setNotice(message);
      setConfirm(null);
    } catch (failure) {
      setError(errorMessage(failure));
      setConfirm(null);
    } finally {
      setPending(false);
    }
  }
  function mutate(path: string, method: string, data: unknown) {
    return send<PresentationDetail>(path, { method, body: JSON.stringify(data) });
  }
  function saveSlide() {
    if (!draft) return;
    const parsed = slideSaveSchema.safeParse({
      ...slideFields(draft),
      expectedRevision: draft.revision,
    });
    if (!parsed.success) {
      setError(
        'Use titles up to 160 characters, text up to 2,000 characters and a duration from 1 to 600 seconds.',
      );
      return;
    }
    void perform(
      async () => accept(await mutate(`/slides/${draft.id}`, 'PATCH', parsed.data)),
      'Slide saved',
    );
  }
  function move(id: string, destination: number) {
    if (
      disabled ||
      slideDirty ||
      destination < 0 ||
      destination >= order.length ||
      !order.includes(id)
    )
      return;
    const next = order.filter((value) => value !== id);
    next.splice(destination, 0, id);
    setOrder(next);
    setNotice('');
  }
  function confirmAction() {
    void perform(
      async () => {
        if (confirm === 'reload')
          accept(await send<PresentationDetail>(`/presentations/${snapshot.id}`));
        else if (confirm === 'slide' && draft)
          accept(
            await mutate(`/slides/${draft.id}`, 'DELETE', { expectedRevision: draft.revision }),
          );
        else if (confirm === 'presentation') {
          const result = await send<{ ok: true; botRevision: number }>(
            `/presentations/${snapshot.id}`,
            { method: 'DELETE', body: JSON.stringify({ expectedRevision: snapshot.revision }) },
          );
          onRemoved(result.botRevision);
        }
      },
      confirm === 'reload' ? 'Saved version loaded' : 'Removed from the draft',
    );
  }
  const translationErrors = draft ? slideTranslationErrors(draft) : {};
  return (
    <>
      <div className="presentation-heading">
        <div>
          <h2>{snapshot.name}</h2>
          <p className="muted small">
            {snapshot.slideCount} / {PRESENTATION_LIMITS.slides} slides · Revision{' '}
            {snapshot.revision}
          </p>
        </div>
        <div className="presentation-actions">
          {snapshot.selected && <StatusBadge tone="success">Selected for this bot</StatusBadge>}
          {editable && (
            <>
              <Button
                variant="secondary"
                disabled={pending || dirty}
                onClick={() =>
                  void perform(
                    async () => {
                      const selected = await send<PresentationSelection>(
                        `/bots/${snapshot.botId}/presentation`,
                        {
                          method: 'PUT',
                          body: JSON.stringify({
                            presentationId: snapshot.selected ? null : snapshot.id,
                            expectedRevision: snapshot.botRevision,
                          }),
                        },
                      );
                      accept({
                        ...snapshot,
                        selected: selected.presentationId === snapshot.id,
                        botRevision: selected.botRevision,
                      });
                    },
                    snapshot.selected
                      ? 'Presentation selection cleared'
                      : 'Presentation selected for this bot',
                  )
                }
              >
                {snapshot.selected ? 'Clear selection' : 'Use for this bot'}
              </Button>
              <PresentationNameDialog
                name={snapshot.name}
                disabled={pending || dirty}
                onSave={async (name) => {
                  setPending(true);
                  setError('');
                  setNotice('');
                  try {
                    accept(
                      await mutate(`/presentations/${snapshot.id}`, 'PATCH', {
                        name,
                        expectedRevision: snapshot.revision,
                      }),
                    );
                    setNotice('Presentation renamed');
                  } catch (failure) {
                    setError(errorMessage(failure));
                    throw failure;
                  } finally {
                    setPending(false);
                  }
                }}
              />
              <Button
                variant="quiet"
                disabled={pending || dirty}
                onClick={() => setConfirm('presentation')}
              >
                Remove presentation
              </Button>
            </>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="form-notice form-notice--error">
          {error} Your local edits are still here. Reload the saved version when you are ready to
          discard them.
        </p>
      )}
      <div className="presentation-save-status">
        <p role="status">
          {pending
            ? 'Saving…'
            : dirty
              ? 'Unsaved changes · Save or reload before switching slides or presentations.'
              : notice || 'All changes saved'}
        </p>
        <Button variant="quiet" disabled={pending} onClick={() => setConfirm('reload')}>
          Reload saved version
        </Button>
      </div>
      <div className="presentation-editor">
        <section className="presentation-outline" aria-label="Slide organisation">
          <div className="presentation-panel-heading">
            <h3>Slides</h3>
            {editable && (
              <Button
                variant="quiet"
                disabled={disabled || dirty || order.length >= PRESENTATION_LIMITS.slides}
                onClick={() =>
                  void perform(async () => {
                    const value = await mutate(`/presentations/${snapshot.id}/slides`, 'POST', {
                      expectedRevision: snapshot.revision,
                    });
                    accept(value, value.slides.at(-1)?.id);
                  }, 'Slide added')
                }
              >
                <Plus size={15} aria-hidden="true" />
                Add slide
              </Button>
            )}
          </div>
          {order.length === 0 && (
            <p className="small muted">Add your first slide to start the story.</p>
          )}
          <ol className="slide-outline" aria-label="Slide outline">
            {order.map((id, index) => {
              const slide =
                id === draft?.id ? draft : snapshot.slides.find((value) => value.id === id);
              if (!slide) return null;
              return (
                <li
                  key={id}
                  onDragOver={(event) => {
                    if (!disabled && !slideDirty) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    move(event.dataTransfer.getData('text/plain'), index);
                  }}
                >
                  <button
                    type="button"
                    className="slide-outline-item"
                    aria-pressed={draft?.id === id}
                    disabled={pending || dirty}
                    draggable={!disabled && !slideDirty}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', id);
                    }}
                    onClick={() => {
                      setDraft(slide);
                      setNotice('');
                    }}
                  >
                    <span className="slide-number">{String(index + 1).padStart(2, '0')}</span>
                    <span>
                      <strong>{slide.title.en || slide.title.ne || 'Untitled slide'}</strong>
                      <small>
                        {slide.target === 'BOTH'
                          ? 'Both screens'
                          : slide.target === 'PRIMARY'
                            ? 'Primary screen'
                            : 'Secondary screen'}{' '}
                        · {slide.durationSeconds}s
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {editable && order.length > 0 && (
            <div className="slide-order-actions">
              <div>
                <Button
                  variant="secondary"
                  aria-label="Move slide up"
                  disabled={disabled || slideDirty || position <= 0}
                  onClick={() => draft && move(draft.id, position - 1)}
                >
                  <ArrowUp size={16} aria-hidden="true" />
                  Up
                </Button>
                <Button
                  variant="secondary"
                  aria-label="Move slide down"
                  disabled={disabled || slideDirty || position < 0 || position >= order.length - 1}
                  onClick={() => draft && move(draft.id, position + 1)}
                >
                  <ArrowDown size={16} aria-hidden="true" />
                  Down
                </Button>
              </div>
              <Button
                disabled={disabled || !orderDirty}
                onClick={() =>
                  void perform(
                    async () =>
                      accept(
                        await mutate(`/presentations/${snapshot.id}/order`, 'PUT', {
                          expectedRevision: snapshot.revision,
                          slideIds: order,
                        }),
                      ),
                    'Slide order saved',
                  )
                }
              >
                Save order
              </Button>
              <p className="small muted">Drag slides or use Up and Down, then save the order.</p>
            </div>
          )}
        </section>
        <section className="presentation-previews" aria-label="Screen previews">
          <div className="presentation-panel-heading">
            <h3>Preview</h3>
            <div className="select-field">
              <label htmlFor="preview-locale" className="sr-only">
                Preview language
              </label>
              <select
                id="preview-locale"
                className="input"
                value={previewLocale}
                onChange={(event) => setPreviewLocale(event.target.value === 'ne' ? 'ne' : 'en')}
              >
                <option value="en">English</option>
                <option value="ne">नेपाली</option>
              </select>
            </div>
          </div>
          <SlidePreview slide={draft} locale={previewLocale} screen="PRIMARY" />
          <SlidePreview slide={draft} locale={previewLocale} screen="SECONDARY" />
          <p className="small muted">
            Draft preview · Videos are muted. Scroll inside a preview to inspect longer text.
          </p>
        </section>
        <section className="slide-properties" aria-label="Slide properties">
          <h3>Slide properties</h3>
          {!draft ? (
            <p className="muted small">Select a slide to edit its content.</p>
          ) : (
            <>
              <Tabs.Root
                value={locale}
                onValueChange={(value) => setLocale(value === 'ne' ? 'ne' : 'en')}
              >
                <Tabs.List className="bot-language-tabs" aria-label="Slide language">
                  <Tabs.Tab value="en" className="bot-language-tab">
                    English
                  </Tabs.Tab>
                  <Tabs.Tab value="ne" className="bot-language-tab">
                    Nepali
                  </Tabs.Tab>
                </Tabs.List>
                {(['en', 'ne'] as const).map((language) => (
                  <Tabs.Panel key={language} value={language}>
                    <fieldset className="slide-fields" disabled={disabled || orderDirty}>
                      <legend className="sr-only">
                        {language === 'en' ? 'English' : 'Nepali'} slide content
                      </legend>
                      <FormField
                        label="Slide title"
                        lang={language}
                        maxLength={160}
                        value={draft.title[language]}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            title: { ...draft.title, [language]: event.target.value },
                          })
                        }
                      />
                      <div className="field">
                        <label htmlFor={`slide-text-${language}`}>Slide text</label>
                        <textarea
                          id={`slide-text-${language}`}
                          className="input"
                          lang={language}
                          rows={5}
                          maxLength={2000}
                          value={draft.body[language]}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              body: { ...draft.body, [language]: event.target.value },
                            })
                          }
                        />
                      </div>
                    </fieldset>
                  </Tabs.Panel>
                ))}
              </Tabs.Root>
              <fieldset className="slide-fields" disabled={disabled || orderDirty}>
                <legend className="sr-only">Display settings</legend>
                <div className="select-field">
                  <label htmlFor="slide-target">Show on</label>
                  <select
                    id="slide-target"
                    className="input"
                    value={draft.target}
                    onChange={(event) => {
                      const target = event.target.value;
                      if (target === 'BOTH' || target === 'PRIMARY' || target === 'SECONDARY')
                        setDraft({ ...draft, target });
                    }}
                  >
                    <option value="BOTH">Both screens</option>
                    <option value="PRIMARY">Primary screen</option>
                    <option value="SECONDARY">Secondary screen</option>
                  </select>
                </div>
                <FormField
                  label="Duration (seconds)"
                  type="number"
                  min={1}
                  max={600}
                  step={1}
                  value={draft.durationSeconds || ''}
                  onChange={(event) =>
                    setDraft({ ...draft, durationSeconds: Number(event.target.value) })
                  }
                />
                <div className="slide-media-field">
                  <span className="field-label">Media</span>
                  <p className="small">{draft.media?.filename ?? 'Text only'}</p>
                  {editable && (
                    <>
                      <PresentationMediaPicker
                        disabled={disabled || orderDirty}
                        onChoose={(media) => setDraft({ ...draft, media, mediaId: media.id })}
                      />
                      {draft.media && (
                        <Button
                          variant="quiet"
                          onClick={() => setDraft({ ...draft, media: null, mediaId: null })}
                        >
                          Detach media
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </fieldset>
              <p className="small slide-completeness">
                {Object.keys(translationErrors).length
                  ? 'Translation incomplete. Add titles in both languages and translate any slide text. You can save this draft now.'
                  : 'English and Nepali content complete. Review both previews before publishing.'}
              </p>
              {editable && (
                <div className="slide-property-actions">
                  <Button disabled={disabled || !slideDirty || orderDirty} onClick={saveSlide}>
                    <Save size={16} aria-hidden="true" />
                    Save slide
                  </Button>
                  <Button
                    variant="quiet"
                    disabled={disabled || dirty}
                    onClick={() => setConfirm('slide')}
                  >
                    Remove slide
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <p className="bot-footnote">
        Changes stay in this draft. Selecting a presentation prepares the bot for a future release.
      </p>
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
              {confirm === 'reload'
                ? 'Reload the saved presentation?'
                : confirm === 'slide'
                  ? 'Remove this slide?'
                  : 'Remove this presentation?'}
            </Dialog.Title>
            <Dialog.Description className="muted">
              {confirm === 'reload'
                ? 'This discards your local edits and loads the latest saved version. Copy anything you want to keep first.'
                : confirm === 'slide'
                  ? 'This removes the slide and closes the gap in the draft order. Its media stays in the library.'
                  : 'This removes all slides in this draft presentation and clears its selection on the bot. Media stays in the library.'}
            </Dialog.Description>
            <div className="dialog-actions">
              <Dialog.Close className="button button--secondary" disabled={pending}>
                Cancel
              </Dialog.Close>
              <Button disabled={pending} onClick={confirmAction}>
                {pending
                  ? 'Working…'
                  : confirm === 'reload'
                    ? 'Discard edits and reload'
                    : confirm === 'slide'
                      ? 'Remove slide'
                      : 'Remove presentation'}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
