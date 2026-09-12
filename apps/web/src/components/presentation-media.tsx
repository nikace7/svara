'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Dialog } from '@base-ui/react/dialog';
import { useQuery } from '@tanstack/react-query';
import { Button, FormField } from '@svara/ui';
import type { MediaDetail, MediaPage, SlideDetail } from '@svara/contracts';
import { errorMessage } from '../lib/staff-api';
import { useStaffRequest, useStaffSession } from './session-provider';
import { StudioLink } from './draft-navigation';

type PreviewMedia = Pick<MediaDetail, 'id' | 'filename' | 'mimeType' | 'width' | 'height'>;
type PreviewSlide = Pick<
  SlideDetail,
  'revision' | 'target' | 'title' | 'body' | 'durationSeconds'
> & {
  media: PreviewMedia | null;
};

function MediaContent({ media }: { media: PreviewMedia }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p role="alert">Media could not load. Reload the saved version to retry.</p>;
  const src = `/api/v1/media/${media.id}/content`;
  return media.mimeType === 'video/mp4' ? (
    <video
      src={src}
      muted
      controls
      playsInline
      preload="metadata"
      aria-label={media.filename}
      onVolumeChange={(event) => {
        event.currentTarget.muted = true;
      }}
      onError={() => setFailed(true)}
    />
  ) : (
    <Image
      src={src}
      alt={media.filename}
      width={media.width ?? 1}
      height={media.height ?? 1}
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}

export function SlidePreview({
  slide,
  locale,
  screen,
}: {
  slide: PreviewSlide | null;
  locale: 'en' | 'ne';
  screen: 'PRIMARY' | 'SECONDARY';
}) {
  const label = screen === 'PRIMARY' ? 'Primary' : 'Secondary';
  const shown = slide && (slide.target === 'BOTH' || slide.target === screen);
  return (
    <section className="slide-preview" aria-label={`${label} screen preview`}>
      <div className="slide-preview-label">
        <h3>{label} screen</h3>
        <span>{slide ? `${slide.durationSeconds}s` : '16:9'}</span>
      </div>
      <div className={`slide-canvas${shown ? '' : ' slide-canvas--empty'}`} lang={locale}>
        {!slide ? (
          <p>Select a slide to preview</p>
        ) : !shown ? (
          <p lang="en">Not shown on this screen</p>
        ) : (
          <>
            {slide.media && (
              <div className="slide-canvas-media">
                <MediaContent key={`${slide.media.id}-${slide.revision}`} media={slide.media} />
              </div>
            )}
            <div
              className="slide-canvas-text"
              tabIndex={0}
              role="region"
              aria-label={`${label} slide text`}
            >
              <h4>{slide.title[locale] || <span lang="en">Untitled slide</span>}</h4>
              {slide.body[locale] && <p>{slide.body[locale]}</p>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function ReadyMedia({ choose }: { choose: (media: MediaDetail) => void }) {
  const send = useStaffRequest();
  const { identity } = useStaffSession();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const media = useQuery({
    queryKey: ['presentation-media', identity.membership.id, search, page],
    queryFn: ({ signal }) =>
      send<MediaPage>(
        `/media?${new URLSearchParams({ state: 'READY', search, page: String(page), pageSize: '20' })}`,
        { signal },
      ),
    staleTime: 0,
  });
  return (
    <>
      <form
        className="bot-search"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(input.trim());
          setPage(1);
        }}
      >
        <FormField
          label="Search ready media"
          value={input}
          maxLength={160}
          onChange={(event) => setInput(event.target.value)}
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {media.isPending ? (
        <p role="status">Loading ready media…</p>
      ) : media.isError ? (
        <div>
          <p role="alert">{errorMessage(media.error)}</p>
          <Button variant="secondary" onClick={() => void media.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {media.data.items.length === 0 && (
            <p>
              No ready files match. Upload and inspect a file in the{' '}
              <StudioLink href="/studio/media">Media library</StudioLink>.
            </p>
          )}
          <ul className="presentation-media-list">
            {media.data.items.map((file) => (
              <li key={file.id}>
                <div>
                  <strong>{file.filename}</strong>
                  <span className="small muted">
                    {file.width} × {file.height} ·{' '}
                    {file.mimeType === 'video/mp4' ? 'Muted video' : 'Image'}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  aria-label={`Use ${file.filename}`}
                  onClick={() => choose(file)}
                >
                  Use file
                </Button>
              </li>
            ))}
          </ul>
          <div className="bot-pagination">
            <span role="status" className="small">
              {media.data.total} ready files · Page {page}
            </span>
            <div>
              <Button
                variant="quiet"
                disabled={page === 1 || media.isFetching}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="quiet"
                disabled={page * media.data.pageSize >= media.data.total || media.isFetching}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export function PresentationMediaPicker({
  disabled,
  onChoose,
}: {
  disabled: boolean;
  onChoose: (media: MediaDetail) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="button button--secondary" disabled={disabled}>
        Choose media
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog-popup presentation-media-dialog">
          <Dialog.Title className="dialog-title">Choose ready media</Dialog.Title>
          <Dialog.Description className="muted">
            Only inspected images and videos can be attached. Videos play muted.
          </Dialog.Description>
          <ReadyMedia
            choose={(media) => {
              onChoose(media);
              setOpen(false);
            }}
          />
          <div className="dialog-actions">
            <Dialog.Close className="button button--secondary">Cancel</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
