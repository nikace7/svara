'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { UploadCloud, X } from 'lucide-react';
import { Button } from '@svara/ui';
import { MEDIA_LIMITS, mediaUploadSchema } from '@svara/contracts';
import type { MediaDetail } from '@svara/contracts';
import { errorMessage } from '../lib/staff-api';
import { useStaffRequest } from './session-provider';

export function MediaUpload({ received }: { received: () => void }) {
  const send = useStaffRequest();
  const input = useRef<HTMLInputElement>(null);
  const active = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [],
  );
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || pending) return;
    const metadata = mediaUploadSchema.safeParse({
      filename: file.name,
      mimeType: file.type,
      byteLength: file.size,
    });
    if (!metadata.success) {
      setError(
        'Choose a JPEG or PNG up to 10 MiB, or an MP4 up to 50 MiB. The filename must fit within 160 characters.',
      );
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError('');
    setNotice('');
    const body = new FormData();
    body.append('metadata', JSON.stringify(metadata.data));
    body.append('file', file);
    try {
      await send<MediaDetail>('/media', {
        method: 'POST',
        body,
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(MEDIA_LIMITS.uploadMs + 5000),
        ]),
      });
      if (active.current !== controller) return;
      setFile(null);
      if (input.current) input.current.value = '';
      setNotice('Upload received. Your file will appear below while it is inspected.');
      received();
    } catch (failure) {
      if (active.current !== controller) return;
      setError(
        controller.signal.aborted
          ? 'Upload cancelled. Choose Upload file to try again.'
          : errorMessage(failure),
      );
      received();
    } finally {
      if (active.current === controller) {
        active.current = null;
        setPending(false);
      }
    }
  }
  return (
    <section className="media-upload panel" aria-labelledby="media-upload-title">
      <div className="media-upload-copy">
        <div className="media-upload-icon">
          <UploadCloud size={26} aria-hidden="true" />
        </div>
        <div>
          <h2 id="media-upload-title">Add to your library</h2>
          <p>Images and short videos for your visitor displays.</p>
          <p className="small muted">
            JPEG / PNG · 10 MiB · 25 megapixels
            <br />
            MP4 · 50 MiB · 1080p · 2 minutes · H.264 with optional AAC audio
          </p>
        </div>
      </div>
      <form className="media-upload-form" onSubmit={(event) => void upload(event)}>
        <label htmlFor="media-file" className="small">
          Choose media
        </label>
        <input
          ref={input}
          id="media-file"
          type="file"
          accept="image/jpeg,image/png,video/mp4"
          disabled={pending}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError('');
            setNotice('');
          }}
        />
        <div className="media-upload-actions">
          <Button type="submit" disabled={!file || pending}>
            <UploadCloud size={16} aria-hidden="true" />
            {pending ? 'Uploading…' : 'Upload file'}
          </Button>
          {pending && (
            <Button type="button" variant="quiet" onClick={() => active.current?.abort()}>
              <X size={16} aria-hidden="true" />
              Cancel upload
            </Button>
          )}
        </div>
        {pending && (
          <p className="small muted" role="status">
            Uploading and validating your file. Leaving this page cancels the upload.
          </p>
        )}
        {notice && (
          <p className="small" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="form-notice form-notice--error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
