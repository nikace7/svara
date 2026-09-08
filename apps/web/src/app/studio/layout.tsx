import type { ReactNode } from 'react';
import { requireLocalPreview } from '../../lib/local-preview';

export default async function StudioLayout({ children }: { children: ReactNode }) {
  await requireLocalPreview();
  return children;
}
