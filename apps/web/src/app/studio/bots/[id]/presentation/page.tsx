import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resourceIdSchema } from '@svara/contracts';
import { PresentationWorkspace } from '../../../../../components/presentation-workspace';

export const metadata: Metadata = { title: 'Presentation' };
export default async function PresentationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!resourceIdSchema.safeParse(id).success) notFound();
  return <PresentationWorkspace botId={id} />;
}
