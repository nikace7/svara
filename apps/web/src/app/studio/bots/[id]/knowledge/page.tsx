import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resourceIdSchema } from '@svara/contracts';
import { KnowledgeList } from '../../../../../components/knowledge-list';

export const metadata: Metadata = { title: 'Knowledge' };
export default async function KnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!resourceIdSchema.safeParse(id).success) notFound();
  return <KnowledgeList botId={id} />;
}
