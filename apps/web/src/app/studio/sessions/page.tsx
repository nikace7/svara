import type { Metadata } from 'next';
import { SessionList } from '../../../components/session-history';

export const metadata: Metadata = { title: 'Sessions' };
export default function SessionsPage() {
  return <SessionList />;
}
