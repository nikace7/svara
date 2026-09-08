import type { ReactNode } from 'react';
import { requireStaffSession } from '../../lib/staff-session';
import { SessionProvider } from '../../components/session-provider';
import { StudioShell } from '../../components/studio-shell';
import { QueryProvider } from '../../components/query-provider';
import { DraftNavigationProvider } from '../../components/draft-navigation';

export default async function StudioLayout({ children }: { children: ReactNode }) {
  const session = await requireStaffSession();
  return (
    <SessionProvider initial={session}>
      <QueryProvider>
        <DraftNavigationProvider>
          <StudioShell>{children}</StudioShell>
        </DraftNavigationProvider>
      </QueryProvider>
    </SessionProvider>
  );
}
