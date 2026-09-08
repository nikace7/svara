'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, AudioLines, Eye, EyeOff } from 'lucide-react';
import { Button, FormField } from '@svara/ui';
import {
  activateInputSchema,
  loginInputSchema,
  recoverInputSchema,
  registerInputSchema,
} from '@svara/contracts';
import {
  broadcastSessionChange,
  errorMessage,
  staffData,
  StaffApiError,
  navigateWithFreshSession,
} from '../lib/staff-api';

type Mode = 'login' | 'register' | 'activate' | 'recover';
const copy = {
  login: {
    heading: 'Welcome back',
    description: 'Sign in to your voice and device workspace.',
    button: 'Sign in',
  },
  register: {
    heading: 'A workspace for your voice',
    description: 'Create your organisation and start shaping your first assistant.',
    button: 'Create workspace',
  },
  activate: {
    heading: 'Join your team',
    description:
      'Set a password for a new account. If you already use Svara, enter your current password; your account name stays the same.',
    button: 'Activate invitation',
  },
  recover: {
    heading: 'Choose a new password',
    description:
      'Your recovery link works once. Updating your password signs out all existing sessions.',
    button: 'Update password',
  },
} as const;

export function AuthForm({ mode }: { mode: Mode }) {
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [complete, setComplete] = useState(false);
  const linkToken = useRef('');
  const errorSummary = useRef<HTMLDivElement>(null);
  const isLink = mode === 'activate' || mode === 'recover';
  useEffect(() => {
    if (!isLink) return;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (token) linkToken.current = token;
    window.history.replaceState(null, '', window.location.pathname);
  }, [isLink]);
  useEffect(() => {
    if (message) errorSummary.current?.focus();
  }, [message]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setMessage('');
    setFields({});
    const input = Object.fromEntries(new FormData(event.currentTarget));
    if (isLink) input.token = linkToken.current;
    const schema = {
      login: loginInputSchema,
      register: registerInputSchema,
      activate: activateInputSchema,
      recover: recoverInputSchema,
    }[mode];
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      setFields(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
        ),
      );
      setMessage(
        isLink && !linkToken.current
          ? 'Open the complete invitation or recovery link provided by your organisation owner.'
          : 'Please check the highlighted fields.',
      );
      return;
    }
    setPending(true);
    try {
      await staffData(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(parsed.data) }, true);
      if (isLink) {
        linkToken.current = '';
        setComplete(true);
        if (mode === 'recover') broadcastSessionChange();
      } else {
        broadcastSessionChange();
        navigateWithFreshSession('/studio');
      }
    } catch (error) {
      setMessage(errorMessage(error));
      if (error instanceof StaffApiError)
        setFields(
          Object.fromEntries(
            Object.entries(error.fieldErrors).map(([key, values]) => [
              key,
              values[0] ?? 'Check this field.',
            ]),
          ),
        );
    } finally {
      setPending(false);
    }
  }

  const content = copy[mode];
  return (
    <main className="auth-page">
      <div className="auth-layout">
        <section className="auth-story" aria-label="About Svara">
          <Link href="/login" className="wordmark">
            <AudioLines size={30} aria-hidden="true" />
            Svara<span className="wordmark-dot">.</span>
          </Link>
          <div className="auth-story-copy">
            <p className="eyebrow">VOICE & DEVICE STUDIO</p>
            <h2>
              Every voice.
              <br />A little closer.
            </h2>
            <p>
              Bring helpful conversations to the spaces people share. One studio for your team, your
              knowledge, and your devices.
            </p>
            <p lang="ne" className="auth-nepali">
              हरेक आवाजको आफ्नै ठाउँ।
            </p>
          </div>
          <p className="small muted">English & Nepali · Built for shared spaces</p>
        </section>
        <section className="auth-card" aria-labelledby="auth-heading">
          <p className="eyebrow">
            {mode === 'register' ? 'GET STARTED' : isLink ? 'STAFF ACCESS' : 'YOUR WORKSPACE'}
          </p>
          <h1 id="auth-heading">
            {complete
              ? mode === 'activate'
                ? 'You’re ready to join'
                : 'Password updated'
              : content.heading}
          </h1>
          <p className="muted">
            {complete ? 'Sign in with your email and password to continue.' : content.description}
          </p>
          {complete ? (
            <Link href="/login" className="button button--primary">
              Continue to sign in <ArrowRight size={17} aria-hidden="true" />
            </Link>
          ) : (
            <form onSubmit={(event) => void submit(event)} noValidate className="staff-form">
              {message && (
                <div
                  className="form-notice form-notice--error"
                  role="alert"
                  tabIndex={-1}
                  ref={errorSummary}
                >
                  {message}
                </div>
              )}
              {(mode === 'register' || mode === 'activate') && (
                <FormField
                  label="Your name"
                  name="displayName"
                  autoComplete="name"
                  maxLength={160}
                  required
                  error={fields.displayName}
                />
              )}
              {mode === 'register' && (
                <FormField
                  label="Organisation name"
                  name="organisationName"
                  autoComplete="organization"
                  maxLength={160}
                  required
                  error={fields.organisationName}
                />
              )}
              {!isLink && (
                <FormField
                  label="Email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  maxLength={254}
                  required
                  error={fields.email}
                />
              )}
              <div className="password-field">
                <FormField
                  label="Password"
                  name="password"
                  type={visible ? 'text' : 'password'}
                  autoComplete={
                    mode === 'login' || mode === 'activate' ? 'current-password' : 'new-password'
                  }
                  maxLength={128}
                  required
                  error={fields.password}
                  {...(mode !== 'login'
                    ? { help: 'Use 12–128 characters. Spaces and Unicode are welcome.' }
                    : {})}
                />
                <Button
                  variant="quiet"
                  type="button"
                  onClick={() => setVisible(!visible)}
                  aria-label={visible ? 'Hide password' : 'Show password'}
                >
                  {visible ? (
                    <EyeOff size={17} aria-hidden="true" />
                  ) : (
                    <Eye size={17} aria-hidden="true" />
                  )}
                  {visible ? 'Hide' : 'Show'}
                </Button>
              </div>
              <Button type="submit" variant="primary" pending={pending}>
                {content.button}
                <ArrowRight size={17} aria-hidden="true" />
              </Button>
              {mode === 'login' && (
                <p className="small muted">
                  Forgot your password? Ask your organisation owner for a recovery link.
                </p>
              )}
            </form>
          )}
          <div className="auth-footer">
            {mode === 'login' ? (
              <>
                New to Svara? <Link href="/register">Create a workspace</Link>
              </>
            ) : (
              <Link href="/login">Back to sign in</Link>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
