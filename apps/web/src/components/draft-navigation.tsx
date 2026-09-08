'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Button } from '@svara/ui';

const DraftContext = createContext<{
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
  leave: (href: string) => void;
} | null>(null);

export function DraftNavigationProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return (
    <DraftContext.Provider value={{ dirty, setDirty, leave: setDestination }}>
      {children}
      <Dialog.Root
        open={destination !== null}
        onOpenChange={(open) => {
          if (!open) setDestination(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="dialog-backdrop" />
          <Dialog.Popup className="dialog-popup">
            <Dialog.Title className="dialog-title">Leave this draft?</Dialog.Title>
            <Dialog.Description className="muted">
              Your unsaved changes will be lost. Stay here to save them first.
            </Dialog.Description>
            <div className="dialog-actions">
              <Dialog.Close className="button button--secondary">Keep editing</Dialog.Close>
              <Button
                onClick={() => {
                  const next = destination;
                  setDirty(false);
                  setDestination(null);
                  if (next) router.push(next);
                }}
              >
                Discard edits and leave
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </DraftContext.Provider>
  );
}

export function useDraftDirty(dirty: boolean) {
  const context = useContext(DraftContext);
  const setDirty = context?.setDirty;
  useEffect(() => {
    setDirty?.(dirty);
    return () => setDirty?.(false);
  }, [dirty, setDirty]);
}

export function StudioLink({ onNavigate, ...props }: ComponentProps<typeof Link>) {
  const context = useContext(DraftContext);
  return (
    <Link
      {...props}
      onNavigate={(event) => {
        if (context?.dirty && typeof props.href === 'string') {
          event.preventDefault();
          context.leave(props.href);
        } else onNavigate?.(event);
      }}
    />
  );
}
