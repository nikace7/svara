import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/noto-sans-devanagari/devanagari-400.css';
import '@fontsource/noto-sans-devanagari/devanagari-600.css';
import './globals.css';
import './staff.css';
import './bots.css';
import './knowledge.css';

export const metadata: Metadata = {
  title: { default: 'Svara — Voice & Device Studio', template: '%s · Svara' },
  description: 'A bilingual voice and browser kiosk studio for your organisation.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
