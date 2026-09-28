import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicAssistant } from '../../../components/public-assistant';

export const metadata: Metadata = { title: 'Assistant', robots: { index: false, follow: false } };
export default async function AssistantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]{12,32}$/.test(slug)) notFound();
  return <PublicAssistant slug={slug} />;
}
