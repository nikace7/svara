'use client';

import { useState } from 'react';
import { Button } from '@svara/ui';

/** A staff test bench: this browser pairs as a kiosk, framed beside its own display. */
export function DeviceSimulator() {
  const [portrait, setPortrait] = useState(false);
  const [generation, setGeneration] = useState(0);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TEST BENCH</p>
          <h1>Device simulator</h1>
          <p className="page-description">
            This browser acts as one paired kiosk. Pair it from Devices, then schedule a release to
            watch the kiosk apply it and the display mirror it. Use a separate browser profile for a
            second kiosk.
          </p>
        </div>
        <span className="schedule-cancel">
          <Button variant="secondary" onClick={() => setPortrait(!portrait)}>
            {portrait ? 'Landscape 16:9' : 'Portrait 9:16'}
          </Button>
          <Button variant="quiet" onClick={() => setGeneration(generation + 1)}>
            Reload both
          </Button>
        </span>
      </div>
      <div className={`device-bench${portrait ? ' device-bench--portrait' : ''}`} key={generation}>
        <iframe title="Kiosk (primary)" src="/kiosk" />
        <iframe title="Display (secondary)" src="/display" />
      </div>
    </>
  );
}
