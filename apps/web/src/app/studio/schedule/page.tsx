import type { Metadata } from 'next';
import { ScheduleBoard } from '../../../components/schedule-board';

export const metadata: Metadata = { title: 'Events & Deployments' };
export default function SchedulePage() {
  return <ScheduleBoard />;
}
