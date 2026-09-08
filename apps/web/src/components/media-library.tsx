'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Dialog } from '@base-ui/react/dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  ImageIcon,
  Images,
  Play,
  RefreshCw,
  Search,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { Button, FormField, StatusBadge } from '@svara/ui';
import { mediaRejectionMessages } from '@svara/contracts';
import type { MediaDetail, MediaPage } from '@svara/contracts';
import { errorMessage } from '../lib/staff-api';
import { useStaffRequest, useStaffSession } from './session-provider';
import { MediaUpload } from './media-upload';

const labels: Record<MediaDetail['state'], string> = {
  UPLOADING: 'Waiting for upload',
  RECEIVING: 'Uploading',
  QUARANTINED: 'Processing',
  INSPECTING: 'Processing',
  READY: 'Ready',
  REJECTED: 'Rejected',
  DELETING: 'Removing',
};
const processing = (entry: MediaDetail) => !['READY', 'REJECTED'].includes(entry.state);
const size = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
    : `${Math.max(1, Math.ceil(bytes / 1024))} KiB`;
const url = (entry: MediaDetail, thumbnail = false) =>
  `/api/v1/media/${entry.id}/${thumbnail ? 'thumbnail' : 'content'}`;

function MediaPreview({ entry, close }: { entry: MediaDetail; close: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog-popup media-preview-dialog">
          <Dialog.Close className="button button--quiet dialog-close" aria-label="Close preview">
            <X size={19} aria-hidden="true" />
          </Dialog.Close>
          <Dialog.Title className="dialog-title">{entry.filename}</Dialog.Title>
          <Dialog.Description className="muted small">
            {entry.width} × {entry.height} · {size(entry.byteLength ?? entry.uploadedBytes)}
            {entry.durationSeconds ? ` · ${entry.durationSeconds.toFixed(1)} seconds` : ''}
          </Dialog.Description>
          {failed ? (
            <p className="form-notice form-notice--error" role="alert">
              This preview is unavailable. Close it and refresh the library to check your access.
            </p>
          ) : (
            <div className="media-preview-surface">
              {entry.mimeType === 'video/mp4' ? (
                <video
                  controls
                  preload="metadata"
                  aria-label={entry.filename}
                  src={url(entry)}
                  onError={() => setFailed(true)}
                />
              ) : (
                <Image
                  src={url(entry)}
                  alt={entry.filename}
                  width={entry.width ?? 1}
                  height={entry.height ?? 1}
                  unoptimized
                  onError={() => setFailed(true)}
                />
              )}
            </div>
          )}
          <a className="button button--secondary" href={url(entry)} download={entry.filename}>
            <Download size={16} aria-hidden="true" />
            Download file
          </a>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RemoveMedia({
  entry,
  close,
  refresh,
}: {
  entry: MediaDetail;
  close: () => void;
  refresh: () => void;
}) {
  const send = useStaffRequest();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    setPending(true);
    setError('');
    try {
      await send(`/media/${entry.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ expectedRevision: entry.revision }),
      });
      refresh();
      close();
    } catch (failure) {
      setError(`${errorMessage(failure)} Close this dialog and refresh before trying again.`);
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog-popup">
          <Dialog.Title className="dialog-title">Remove this file?</Dialog.Title>
          <Dialog.Description className="muted">
            {entry.filename} will be removed from your library. Upload the original again if you
            need it later.
          </Dialog.Description>
          {error && (
            <p className="form-notice form-notice--error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <Dialog.Close className="button button--secondary" disabled={pending}>
              Keep file
            </Dialog.Close>
            <Button disabled={pending} onClick={() => void remove()}>
              {pending ? 'Removing…' : 'Remove file'}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function MediaLibrary() {
  const { identity } = useStaffSession();
  const canAuthor = ['OWNER', 'ADMINISTRATOR'].includes(identity.membership.role);
  const send = useStaffRequest();
  const client = useQueryClient();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('ALL');
  const [state, setState] = useState('ALL');
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<MediaDetail | null>(null);
  const [removing, setRemoving] = useState<MediaDetail | null>(null);
  const key = ['media', identity.membership.id];
  const library = useQuery({
    queryKey: [...key, search, kind, state, page],
    queryFn: ({ signal }) =>
      send<MediaPage>(
        `/media?${new URLSearchParams({ search, kind, state, page: String(page) })}`,
        { signal },
      ),
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.items.some(processing) ? 2500 : false),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: key });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE ASSETS</p>
          <h1>Media library</h1>
          <p className="page-description">
            A shared home for the visuals that welcome your visitors.
          </p>
        </div>
        <Button variant="secondary" disabled={library.isFetching} onClick={refresh}>
          <RefreshCw size={16} aria-hidden="true" />
          Refresh library
        </Button>
      </div>
      {canAuthor ? (
        <MediaUpload
          received={() => {
            setInput('');
            setSearch('');
            setState('ALL');
            setKind('ALL');
            setPage(1);
            refresh();
          }}
        />
      ) : (
        <p className="form-notice">
          You can preview files. An owner or administrator can add or remove media.
        </p>
      )}
      <section className="panel media-library" aria-label="Media files">
        <div className="bot-toolbar">
          <form
            className="bot-search"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(input);
              setPage(1);
            }}
          >
            <FormField
              label="Search files"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={160}
              placeholder="Search by filename"
            />
            <Button type="submit" variant="secondary">
              <Search size={16} aria-hidden="true" />
              Search
            </Button>
          </form>
          <div className="knowledge-filters">
            <div className="select-field">
              <label htmlFor="media-kind">Media type</label>
              <select
                id="media-kind"
                className="input"
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">All media</option>
                <option value="IMAGE">Images</option>
                <option value="VIDEO">Videos</option>
              </select>
            </div>
            <div className="select-field">
              <label htmlFor="media-state">File status</label>
              <select
                id="media-state"
                className="input"
                value={state}
                onChange={(event) => {
                  setState(event.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">All statuses</option>
                <option value="READY">Ready</option>
                <option value="REJECTED">Rejected</option>
                <option value="QUARANTINED">Waiting for inspection</option>
                <option value="INSPECTING">Inspecting</option>
              </select>
            </div>
          </div>
        </div>
        {library.isPending ? (
          <p role="status" className="bot-empty">
            Loading media…
          </p>
        ) : library.isError ? (
          <div className="bot-empty">
            <p role="alert">{errorMessage(library.error)}</p>
            <Button variant="secondary" onClick={refresh}>
              Try again
            </Button>
          </div>
        ) : library.data.items.length === 0 ? (
          <div className="bot-empty">
            <Images size={36} aria-hidden="true" />
            <h2>
              {search || kind !== 'ALL' || state !== 'ALL'
                ? 'No matching files'
                : 'Make your welcome visual'}
            </h2>
            <p>
              {canAuthor
                ? 'Add a welcome image, campus photograph or short video to start your library.'
                : 'Your team has not added any files here yet.'}
            </p>
          </div>
        ) : (
          <ul className="media-grid">
            {library.data.items.map((entry) => (
              <li className="media-card" key={entry.id}>
                <div className="media-card-visual">
                  {entry.state === 'READY' && entry.hasThumbnail ? (
                    <Image src={url(entry, true)} width={320} height={200} alt="" unoptimized />
                  ) : entry.mimeType === 'video/mp4' ? (
                    <Video size={34} aria-hidden="true" />
                  ) : (
                    <ImageIcon size={34} aria-hidden="true" />
                  )}
                  <span className="media-format">
                    {entry.mimeType.split('/')[1]?.toUpperCase()}
                  </span>
                </div>
                <div className="media-card-copy">
                  <h2>{entry.filename}</h2>
                  <p className="small muted">
                    {size(entry.byteLength ?? entry.uploadedBytes)}
                    {entry.width ? ` · ${entry.width} × ${entry.height}` : ''}
                    {entry.durationSeconds ? ` · ${entry.durationSeconds.toFixed(1)}s` : ''}
                  </p>
                  <StatusBadge
                    tone={
                      entry.state === 'READY'
                        ? 'success'
                        : entry.state === 'REJECTED'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {labels[entry.state]}
                  </StatusBadge>
                  {entry.rejection && (
                    <p className="media-rejection small">
                      {mediaRejectionMessages[entry.rejection]}
                    </p>
                  )}
                  <div className="media-card-actions">
                    {entry.state === 'READY' && (
                      <Button
                        variant="secondary"
                        aria-label={`Preview ${entry.filename}`}
                        onClick={() => setPreview(entry)}
                      >
                        <Play size={15} aria-hidden="true" />
                        Preview
                      </Button>
                    )}
                    {canAuthor && (
                      <Button
                        variant="quiet"
                        aria-label={`Remove ${entry.filename}`}
                        disabled={['RECEIVING', 'INSPECTING', 'DELETING'].includes(entry.state)}
                        onClick={() => setRemoving(entry)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        <span>Remove</span>
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {library.data && !library.isError && (
          <div className="bot-pagination">
            <p className="small" role="status">
              {library.data.total} files · Page {page}
            </p>
            <div>
              <Button
                variant="quiet"
                disabled={page === 1 || library.isFetching}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="quiet"
                disabled={page * library.data.pageSize >= library.data.total || library.isFetching}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </section>
      <p className="bot-footnote">
        Files become available after inspection. Your library is private to your organisation.
      </p>
      {preview && <MediaPreview entry={preview} close={() => setPreview(null)} />}
      {removing && (
        <RemoveMedia entry={removing} close={() => setRemoving(null)} refresh={refresh} />
      )}
    </>
  );
}
