import { createHash } from 'node:crypto';
import type { Prisma } from '@svara/database';
import {
  RELEASE_LIMITS,
  botDraftSchema,
  knowledgeApprovalErrors,
  releaseSnapshotSchema,
  slideTranslationErrors,
} from '@svara/contracts';
import type { ReleaseIssue, ReleaseReadiness, ReleaseSnapshot } from '@svara/contracts';

export const releaseDraftInclude = {
  draft: {
    include: {
      presentation: {
        include: { slides: { include: { media: true }, orderBy: { position: 'asc' } } },
      },
    },
  },
  knowledge: {
    where: { selected: true },
    // Written order: public suggestions are the first FAQs, so the author's order must hold.
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ] as Prisma.KnowledgeEntryOrderByWithRelationInput[],
    take: RELEASE_LIMITS.knowledgeEntries + 1,
  },
} as const;
export type ReleaseDraft = Prisma.BotGetPayload<{ include: typeof releaseDraftInclude }>;

/** Stable object ordering also survives PostgreSQL's JSONB key ordering. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error('Cannot hash an undefined snapshot field.');
  return result;
}
export function releaseSnapshotHash(snapshot: ReleaseSnapshot): string {
  return createHash('sha256').update(canonical(snapshot)).digest('hex');
}

export function assembleRelease(
  bot: ReleaseDraft,
  providerMode: ReleaseSnapshot['providerMode'],
): { readiness: ReleaseReadiness; snapshot: ReleaseSnapshot | null } {
  const issues: ReleaseIssue[] = [];
  const add = (
    code: ReleaseIssue['code'],
    path: string,
    message: string,
    blocks: ReleaseIssue['blocks'] = 'ALL',
  ) => issues.push({ code, path, message, blocks });
  const translations = (path: string, errors: Record<string, string[]>) => {
    for (const [field, messages] of Object.entries(errors))
      add('MISSING_TRANSLATION', `${path}.${field}`, messages.join(' '));
  };
  const config = botDraftSchema.safeParse(bot.draft?.config);
  if (!config.success) {
    for (const issue of config.error.issues)
      add(
        'INVALID_CONFIG',
        `draft.${issue.path.join('.')}`,
        'Save a valid persona, voice and tool configuration.',
      );
  } else {
    if (!config.data.persona.trim())
      add('INVALID_CONFIG', 'draft.persona', 'Describe how the guide should assist visitors.');
    for (const field of ['greeting', 'fallback'] as const)
      for (const locale of ['en', 'ne'] as const)
        if (!config.data[field][locale].trim())
          add(
            'MISSING_TRANSLATION',
            `draft.${field}.${locale}`,
            `Add the ${field} in this language.`,
          );
  }
  if (bot.knowledge.length > RELEASE_LIMITS.knowledgeEntries)
    add('RELEASE_LIMIT', 'knowledge', 'Select at most 200 knowledge entries per release.');
  const knowledge = bot.knowledge.map((entry) => {
    const value = {
      id: entry.id,
      revision: entry.revision,
      type: entry.type,
      title: entry.title,
      status: entry.status,
      content: { en: entry.contentEn, ne: entry.contentNe },
      question: { en: entry.questionEn, ne: entry.questionNe },
    };
    translations(`knowledge.${entry.id}`, knowledgeApprovalErrors(value));
    if (entry.status !== 'APPROVED')
      add(
        'UNAPPROVED_KNOWLEDGE',
        `knowledge.${entry.id}.status`,
        'Approve this selected entry before publishing.',
        'PUBLISH',
      );
    return value;
  });
  const selected = bot.draft?.presentation;
  const media = new Map<string, ReleaseSnapshot['media'][number]>();
  const slides = (selected?.slides ?? []).map((slide) => {
    const value = {
      id: slide.id,
      revision: slide.revision,
      position: slide.position,
      title: { en: slide.titleEn, ne: slide.titleNe },
      body: { en: slide.bodyEn, ne: slide.bodyNe },
      mediaId: slide.mediaId,
      target: slide.target,
      durationSeconds: slide.durationSeconds,
    };
    translations(`presentation.slides.${slide.id}`, slideTranslationErrors(value));
    if (slide.mediaId) {
      const asset = slide.media;
      if (
        !asset ||
        asset.state !== 'READY' ||
        !asset.sha256 ||
        !asset.byteLength ||
        !asset.width ||
        !asset.height ||
        !asset.mimeType
      )
        add(
          'MEDIA_NOT_READY',
          `presentation.slides.${slide.id}.mediaId`,
          'Choose inspected, ready media for this slide.',
        );
      else
        media.set(asset.id, {
          id: asset.id,
          filename: asset.filename,
          mimeType: asset.mimeType as ReleaseSnapshot['media'][number]['mimeType'],
          sha256: asset.sha256,
          byteLength: asset.byteLength,
          width: asset.width,
          height: asset.height,
          durationSeconds: asset.durationSeconds,
        });
    }
    return value;
  });
  if (selected && !slides.length)
    add(
      'EMPTY_PRESENTATION',
      'presentation',
      'Add a slide to the selected presentation or clear the selection.',
    );
  if (config.success && config.data.tools.includes('show_slide') && !slides.length)
    add(
      'TOOL_REQUIRES_PRESENTATION',
      'draft.tools',
      'Select a presentation with slides to enable Show slide.',
    );
  const candidate = {
    schemaVersion: 1,
    providerMode,
    bot: {
      id: bot.id,
      name: bot.name,
      description: bot.description,
      revision: bot.revision,
      config: config.success ? config.data : null,
    },
    knowledge,
    presentation: selected
      ? { id: selected.id, name: selected.name, revision: selected.revision, slides }
      : null,
    media: [...media.values()].sort((left, right) => left.id.localeCompare(right.id)),
  };
  const parsed = releaseSnapshotSchema.safeParse(candidate);
  if (!parsed.success && !issues.some((issue) => issue.blocks === 'ALL'))
    add(
      'RELEASE_LIMIT',
      'snapshot',
      'The snapshot is invalid or exceeds its limits. Review selected content and media.',
    );
  return {
    readiness: {
      botId: bot.id,
      botRevision: bot.revision,
      providerMode,
      canPreview: !issues.some((issue) => issue.blocks === 'ALL'),
      canPublish: issues.length === 0,
      issues,
    },
    snapshot: parsed.success ? parsed.data : null,
  };
}
