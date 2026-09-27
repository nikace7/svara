import type { Metadata } from 'next';
import { DeviceRegistry } from '../../../components/device-registry';

export const metadata: Metadata = { title: 'Devices' };
export default function DevicesPage() {
  return <DeviceRegistry />;
}
