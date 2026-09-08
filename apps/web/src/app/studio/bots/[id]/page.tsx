import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resourceIdSchema } from '@svara/contracts';
import { BotEditor } from '../../../../components/bot-editor';

export const metadata: Metadata = { title: 'Bot draft' };
export default async function BotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!resourceIdSchema.safeParse(id).success) notFound();
  return <BotEditor id={id} />;
}
