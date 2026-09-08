'use client';

import { StudioLink } from './draft-navigation';

export function BotSections({ id, active }: { id: string; active: 'identity' | 'knowledge' }) {
  return (
    <nav className="bot-sections" aria-label="Bot sections">
      <StudioLink
        href={`/studio/bots/${id}`}
        aria-current={active === 'identity' ? 'page' : undefined}
      >
        Identity
      </StudioLink>
      <StudioLink
        href={`/studio/bots/${id}/knowledge`}
        aria-current={active === 'knowledge' ? 'page' : undefined}
      >
        Knowledge
      </StudioLink>
      <span aria-disabled="true" title="Presentation editing is being built">
        Presentation
      </span>
      <span aria-disabled="true" title="Release publishing is being built">
        Releases
      </span>
    </nav>
  );
}
