import type { Metadata } from 'next';
import { AnalyticsReport } from '../../../components/analytics-report';
import { providerMode } from '../../../lib/provider-mode';

export const metadata: Metadata = { title: 'Analytics' };
export default async function AnalyticsPage() {
  return <AnalyticsReport mode={await providerMode()} />;
}
