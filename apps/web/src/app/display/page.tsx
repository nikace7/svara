import type { Metadata } from 'next';
import { DeviceScreen } from '../../components/device-screen';

export const metadata: Metadata = { title: 'Kiosk display' };
export default function DisplayPage() {
  return <DeviceScreen role="DISPLAY" />;
}
