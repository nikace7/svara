import type { Metadata } from 'next';
import { DeviceScreen } from '../../components/device-screen';
import { providerMode } from '../../lib/provider-mode';

export const metadata: Metadata = { title: 'Kiosk' };
export default async function KioskPage() {
  return <DeviceScreen role="PRIMARY" providerMode={await providerMode()} />;
}
