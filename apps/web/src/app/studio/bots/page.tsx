import type { Metadata } from 'next';
import { BotList } from '../../../components/bot-list';

export const metadata: Metadata = { title: 'Bots' };
export default function BotsPage() {
  return <BotList />;
}
