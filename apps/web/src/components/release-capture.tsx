'use client';

import { useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Button } from '@svara/ui';
import { releaseDetailSchema } from '@svara/contracts';
import type { BotDetail, ReleaseDetail, ReleaseReadiness } from '@svara/contracts';
import { errorMessage, StaffApiError } from '../lib/staff-api';
import { useStaffRequest } from './session-provider';

type Attempt = { kind: 'PREVIEW' | 'PUBLISHED'; key: string; revision: number };

export function ReleaseCapture({
  bot,
  readiness,
  disabled,
  onCreated,
}: {
  bot: BotDetail;
  readiness: ReleaseReadiness | undefined;
  disabled: boolean;
  onCreated: (release: ReleaseDetail) => void;
}) {
  const send = useStaffRequest();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [uncertain, setUncertain] = useState(false);
  const inFlight = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const retryButton = useRef<HTMLButtonElement | null>(null);

  function begin(kind: Attempt['kind'], element: HTMLElement) {
    opener.current = element;
    setAttempt({ kind, key: crypto.randomUUID(), revision: bot.revision });
    setFailure(null);
    setUncertain(false);
    setOpen(true);
  }
  async function capture() {
    if (!attempt || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFailure(null);
    let created: ReleaseDetail;
    try {
      created = releaseDetailSchema.parse(
        await send<unknown>(
          `/bots/${bot.id}/${attempt.kind === 'PREVIEW' ? 'preview' : 'releases'}`,
          {
            method: 'POST',
            headers: { 'Idempotency-Key': attempt.key },
            body: JSON.stringify({ expectedRevision: attempt.revision }),
          },
        ),
      );
    } catch (error) {
      setFailure(error);
      // A lost response may follow a committed capture. Preserve its exact key and revision.
      setUncertain(!(error instanceof StaffApiError) || error.status >= 500);
      return;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
    setUncertain(false);
    setAttempt(null);
    setOpen(false);
    onCreated(created);
  }
  const blocked = disabled || pending || uncertain;
  return (
    <>
      <div className="release-actions">
        <Button
          disabled={blocked || !readiness?.canPreview}
          onClick={(event) => begin('PREVIEW', event.currentTarget)}
        >
          Create preview
        </Button>
        <Button
          variant="primary"
          disabled={blocked || !readiness?.canPublish}
          onClick={(event) => begin('PUBLISHED', event.currentTarget)}
        >
          Publish release
        </Button>
      </div>
      {uncertain && !open && (
        <div className="form-notice release-retry">
          <p>Your request may have completed. Retry to check before creating another release.</p>
          <Button ref={retryButton} onClick={() => setOpen(true)}>
            Retry release request
          </Button>
        </div>
      )}
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (inFlight.current) return;
          setOpen(next);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="dialog-backdrop" />
          <Dialog.Popup
            className="dialog-popup"
            finalFocus={() => retryButton.current ?? opener.current}
          >
            <Dialog.Title className="dialog-title">
              {attempt?.kind === 'PREVIEW' ? 'Save a staff preview' : 'Publish this draft'}
            </Dialog.Title>
            <Dialog.Description className="muted">
              {attempt?.kind === 'PREVIEW'
                ? 'Save a fixed snapshot for staff testing. Queries are available for 30 minutes; draft knowledge is labelled in the snapshot.'
                : 'Save a numbered, immutable version of this bot and its selected content. Later draft edits will not change it.'}
            </Dialog.Description>
            <p className="release-capture-note">
              Draft revision {attempt?.revision} ·{' '}
              {readiness?.providerMode === 'fixture' ? 'Fixture demo' : 'Live provider mode'}.
              Saving does not deploy to a device.
            </p>
            {!!failure && (
              <div className="form-error" role="alert">
                <p>{errorMessage(failure)}</p>
                <p>
                  {uncertain
                    ? 'The request may have completed. Retry this same request to retrieve its result.'
                    : 'Close this dialog and recheck the draft before trying again.'}
                </p>
              </div>
            )}
            <div className="dialog-actions">
              <Dialog.Close className="button button--secondary" disabled={pending}>
                {failure ? 'Close' : 'Cancel'}
              </Dialog.Close>
              {(!failure || uncertain) && (
                <Button variant="primary" pending={pending} onClick={() => void capture()}>
                  {uncertain
                    ? 'Retry request'
                    : attempt?.kind === 'PREVIEW'
                      ? 'Save preview'
                      : 'Publish version'}
                </Button>
              )}
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
