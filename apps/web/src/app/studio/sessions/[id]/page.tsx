import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resourceIdSchema } from '@svara/contracts';
import { SessionRecord } from '../../../../components/session-history';

export const metadata: Metadata = { title: 'Session' };
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!resourceIdSchema.safeParse(id).success) notFound();
  return <SessionRecord id={id} />;
}
