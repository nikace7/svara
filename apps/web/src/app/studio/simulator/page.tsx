import type { Metadata } from 'next';
import { DeviceSimulator } from '../../../components/device-simulator';

export const metadata: Metadata = { title: 'Device simulator' };
export default function SimulatorPage() {
  return <DeviceSimulator />;
}
