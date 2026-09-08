import type { ReactNode } from 'react';
import { requireStaffSession } from '../../lib/staff-session';
import { SessionProvider } from '../../components/session-provider';
import { StudioShell } from '../../components/studio-shell';
import { QueryProvider } from '../../components/query-provider';

export default async function StudioLayout({ children }: { children: ReactNode }) {
  const session = await requireStaffSession();
  return (
    <SessionProvider initial={session}>
      <QueryProvider>
        <StudioShell>{children}</StudioShell>
      </QueryProvider>
    </SessionProvider>
  );
}
