import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resourceIdSchema } from '@svara/contracts';
import { ReleaseWorkspace } from '../../../../../components/release-workspace';

export const metadata: Metadata = { title: 'Releases' };
export default async function ReleasesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!resourceIdSchema.safeParse(id).success) notFound();
  return <ReleaseWorkspace botId={id} />;
}
