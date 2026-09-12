'use client';

import { StudioLink } from './draft-navigation';

export function BotSections({
  id,
  active,
}: {
  id: string;
  active: 'identity' | 'knowledge' | 'presentation' | 'releases';
}) {
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
      <StudioLink
        href={`/studio/bots/${id}/presentation`}
        aria-current={active === 'presentation' ? 'page' : undefined}
      >
        Presentation
      </StudioLink>
      <StudioLink
        href={`/studio/bots/${id}/releases`}
        aria-current={active === 'releases' ? 'page' : undefined}
      >
        Releases
      </StudioLink>
    </nav>
  );
}
