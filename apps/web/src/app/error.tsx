'use client';

import { Button } from '@svara/ui';

export default function StudioError({ retry }: { retry: () => void }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">SVARA STUDIO</p>
        <h1>We couldn’t open the studio</h1>
        <p>The service may be temporarily unavailable. Your work remains saved.</p>
        <Button onClick={retry}>Try again</Button>
        <a href="/login">Return to sign in</a>
      </section>
    </main>
  );
}
