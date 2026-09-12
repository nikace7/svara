'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Plus } from 'lucide-react';
import { Button, FormField } from '@svara/ui';
import { errorMessage } from '../lib/staff-api';
export function PresentationNameDialog({
  name,
  disabled,
  onSave,
}: {
  name?: string;
  disabled: boolean;
  onSave: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('name') ?? '').trim();
    if (!value || value.length > 120) {
      setError('Use a name from 1 to 120 characters.');
      return;
    }
    setPending(true);
    setError('');
    try {
      await onSave(value);
      setOpen(false);
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
      <Dialog.Trigger
        className={`button button--${name ? 'quiet' : 'primary'}`}
        disabled={disabled}
      >
        {!name && <Plus size={16} aria-hidden="true" />}
        {name ? 'Rename' : 'New presentation'}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog-popup">
          <Dialog.Title className="dialog-title">
            {name ? 'Rename presentation' : 'New presentation'}
          </Dialog.Title>
          <Dialog.Description className="muted">
            Give this set of slides a name your team will recognise.
          </Dialog.Description>
          <form className="staff-form" onSubmit={(event) => void submit(event)}>
            {error && (
              <p role="alert" className="form-notice form-notice--error">
                {error}
              </p>
            )}
            <FormField
              label="Presentation name"
              name="name"
              defaultValue={name ?? ''}
              maxLength={120}
              required
              disabled={pending}
            />
            <div className="dialog-actions">
              <Dialog.Close className="button button--secondary" disabled={pending}>
                Cancel
              </Dialog.Close>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : name ? 'Save name' : 'Create presentation'}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
