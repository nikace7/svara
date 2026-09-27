import type { Metadata } from 'next';
import { DeviceScreen } from '../../components/device-screen';

export const metadata: Metadata = { title: 'Kiosk' };
export default function KioskPage() {
  return <DeviceScreen role="PRIMARY" />;
}
