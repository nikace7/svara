import type { ReactNode } from 'react';
import { requireLocalPreview } from '../../lib/local-preview';
import { StudioShell } from '../../components/studio-shell';
import { QueryProvider } from '../../components/query-provider';

export default async function StudioLayout({ children }: { children: ReactNode }) {
  await requireLocalPreview();
  return (
    <QueryProvider>
      <StudioShell>{children}</StudioShell>
    </QueryProvider>
  );
}
