import type { Metadata } from 'next';
import { Playground } from '../../../components/playground';
import { providerMode } from '../../../lib/provider-mode';

export const metadata: Metadata = { title: 'Playground' };
export default async function PlaygroundPage() {
  return <Playground mode={await providerMode()} />;
}
