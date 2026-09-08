import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resourceIdSchema } from '@svara/contracts';
import { KnowledgeEditor } from '../../../../../../components/knowledge-editor';

export const metadata: Metadata = { title: 'Knowledge entry' };
export default async function KnowledgeEntryPage({
  params,
}: {
  params: Promise<{ id: string; entryId: string }>;
}) {
  const { id, entryId } = await params;
  if (!resourceIdSchema.safeParse(id).success || !resourceIdSchema.safeParse(entryId).success)
    notFound();
  return <KnowledgeEditor botId={id} entryId={entryId} />;
}
