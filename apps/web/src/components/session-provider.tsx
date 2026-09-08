'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  staffData,
  StaffApiError,
  sessionExpiredEvent,
  navigateWithFreshSession,
} from '../lib/staff-api';
import type { StaffSession } from '../lib/staff-api';

const SessionContext = createContext<StaffSession | null>(null);

export function useStaffSession(): StaffSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error('Staff session provider is required.');
  return session;
}

/** Bind actions to the rendered session; cookie rotation makes stale forms fail CSRF checks. */
export function useStaffRequest() {
  const { csrfToken } = useStaffSession();
  return <T,>(path: string, init?: RequestInit): Promise<T> => {
    const headers = new Headers(init?.headers);
    headers.set('X-CSRF-Token', csrfToken);
    return staffData<T>(path, { ...init, headers });
  };
}

export function SessionProvider({
  initial,
  children,
}: {
  initial: StaffSession;
  children: ReactNode;
}) {
  const [session, setSession] = useState(initial);
  const [leaving, setLeaving] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let checking = false;
    const expire = () => {
      setLeaving(true);
      navigateWithFreshSession('/login');
    };
    const changed = () => {
      setLeaving(true);
      navigateWithFreshSession('/studio');
    };
    const check = async () => {
      if (checking || document.visibilityState === 'hidden') return;
      checking = true;
      try {
        const next = await staffData<StaffSession>('/auth/session', {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        if (controller.signal.aborted) return;
        if (
          next.identity.membership.id !== initial.identity.membership.id ||
          next.identity.membership.role !== initial.identity.membership.role ||
          next.identity.user.id !== initial.identity.user.id
        ) {
          changed();
          return;
        }
        setSession(next);
        setUnavailable(false);
      } catch (error) {
        if (!controller.signal.aborted && !(error instanceof StaffApiError && error.status === 401))
          setUnavailable(true);
      } finally {
        checking = false;
      }
    };
    const channel =
      typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('svara:staff');
    if (channel)
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data === 'session.changed') changed();
      };
    const interval = setInterval(() => void check(), 30000);
    const focus = () => void check();
    window.addEventListener(sessionExpiredEvent, expire);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => {
      controller.abort();
      clearInterval(interval);
      channel?.close();
      window.removeEventListener(sessionExpiredEvent, expire);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [initial]);
  if (leaving)
    return (
      <main className="auth-page">
        <p role="status">Updating your session…</p>
      </main>
    );
  return (
    <SessionContext.Provider value={session}>
      {unavailable && (
        <div className="connection-notice" role="alert">
          Session checks are unavailable. Changes may fail until the connection returns.
        </div>
      )}
      {children}
    </SessionContext.Provider>
  );
}
