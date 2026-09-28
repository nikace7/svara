import { randomInt } from 'node:crypto';
import type { PrismaClient, Prisma } from '@svara/database';
import {
  assistantLinkCreateSchema,
  assistantLinkSaveSchema,
  releaseSnapshotSchema,
  resourceIdSchema,
  CONVERSATION_LIMITS,
} from '@svara/contracts';
import type { AssistantLink, ProviderMode, PublicAssistant } from '@svara/contracts';
import { hashSecret } from '../devices/core.js';
import { openReadyMedia, runtimeRelease } from '../devices/releases.js';
import { createToken, csrfToken } from '../identity/security.js';
import type { IdentityService } from '../identity/service.js';
import type { MediaStorage } from '../media/storage.js';
import { endSessions } from './core.js';
import { ConversationError } from './errors.js';

type Transaction = Prisma.TransactionClient;
const linkInclude = { release: { include: { bot: { select: { name: true } } } } } as const;
type StoredLink = Prisma.AssistantLinkGetPayload<{ include: typeof linkInclude }>;

function parse<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ConversationError('INVALID_INPUT');
  return result.data;
}
/** 16 characters from 36: about 82 bits, so links cannot be enumerated. */
function slug(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 16 }, () => alphabet[randomInt(alphabet.length)]).join('');
}
const usable = (link: { enabled: boolean; expiresAt: Date | null }, now: Date) =>
  link.enabled && (!link.expiresAt || link.expiresAt > now);

/** Staff-side public links: pin a published release, then enable, disable or expire it. */
export class AssistantLinkService {
  constructor(
    private readonly identity: IdentityService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async view(tx: Transaction, link: StoredLink): Promise<AssistantLink> {
    const now = this.clock();
    return {
      id: link.id,
      slug: link.slug,
      releaseId: link.releaseId,
      botName: link.release.bot.name,
      releaseVersion: link.release.version!,
      label: link.label,
      enabled: link.enabled,
      expiresAt: link.expiresAt?.toISOString() ?? null,
      revision: link.revision,
      activeSessions: await tx.conversationSession.count({
        where: { linkId: link.id, status: 'ACTIVE', idleUntil: { gt: now }, endsBy: { gt: now } },
      }),
      createdAt: link.createdAt.toISOString(),
    };
  }

  private async published(tx: Transaction, organisationId: string, releaseId: string) {
    const release = await tx.botRelease.findFirst({
      where: { id: releaseId, organisationId, kind: 'PUBLISHED' },
      select: { id: true },
    });
    if (!release) throw new ConversationError('RELEASE_UNAVAILABLE');
  }

  async list(token: string): Promise<AssistantLink[]> {
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => {
        const links = await tx.assistantLink.findMany({
          where: { organisationId: member.organisationId },
          include: linkInclude,
          orderBy: { createdAt: 'desc' },
          take: 100,
        });
        return Promise.all(links.map((link) => this.view(tx, link)));
      },
      false,
    );
  }

  async create(token: string, value: unknown): Promise<AssistantLink> {
    const input = parse(assistantLinkCreateSchema, value);
    return this.identity.asStaff(token, 'manage_public_links', async (tx, { member }) => {
      await this.published(tx, member.organisationId, input.releaseId);
      const now = this.clock();
      if (input.expiresAt && new Date(input.expiresAt) <= now)
        throw new ConversationError('INVALID_INPUT');
      const link = await tx.assistantLink.create({
        data: {
          organisationId: member.organisationId,
          slug: slug(),
          releaseId: input.releaseId,
          label: input.label,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdByMembershipId: member.id,
        },
        include: linkInclude,
      });
      await tx.auditEntry.create({
        data: {
          organisationId: member.organisationId,
          actorMembershipId: member.id,
          action: 'assistant_link.created',
          targetId: link.id,
        },
      });
      return this.view(tx, link);
    });
  }

  /** Disabling or expiring a link ends its open sessions in the same transaction. Existing
   * sessions keep their pinned release when a new release is selected. */
  async save(token: string, id: string, value: unknown): Promise<AssistantLink> {
    parse(resourceIdSchema, id);
    if (value && typeof value === 'object' && !('expectedRevision' in value))
      throw new ConversationError('PRECONDITION_REQUIRED');
    const input = parse(assistantLinkSaveSchema, value);
    return this.identity.asStaff(token, 'manage_public_links', async (tx, { member }) => {
      await tx.$queryRaw`SELECT "id" FROM "AssistantLink" WHERE "id" = ${id}::uuid AND "organisationId" = ${member.organisationId}::uuid FOR UPDATE`;
      const current = await tx.assistantLink.findFirst({
        where: { id, organisationId: member.organisationId },
      });
      if (!current) throw new ConversationError('NOT_FOUND');
      if (current.revision !== input.expectedRevision)
        throw new ConversationError('REVISION_CONFLICT', current.revision);
      await this.published(tx, member.organisationId, input.releaseId);
      const now = this.clock();
      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      const link = await tx.assistantLink.update({
        where: { id },
        data: {
          releaseId: input.releaseId,
          label: input.label,
          enabled: input.enabled,
          expiresAt,
          revision: { increment: 1 },
        },
        include: linkInclude,
      });
      if (!usable(link, now)) await endSessions(tx, { linkId: id }, 'LINK_DISABLED', now);
      await tx.auditEntry.create({
        data: {
          organisationId: member.organisationId,
          actorMembershipId: member.id,
          action: link.enabled ? 'assistant_link.updated' : 'assistant_link.disabled',
          targetId: id,
        },
      });
      return this.view(tx, link);
    });
  }
}

/**
 * The anonymous side of a link. Every read re-checks that the link is enabled and unexpired;
 * an unknown, disabled or expired slug is the same 404, so links cannot be probed.
 */
export class PublicAssistants {
  constructor(
    private readonly db: PrismaClient,
    private readonly storage: MediaStorage,
    private readonly options: { pepper: string; providerMode: ProviderMode },
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private transaction<T>(run: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.$transaction(run, {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 10000,
    });
  }

  private async link(tx: Transaction, value: string) {
    if (!/^[a-z0-9]{12,32}$/.test(value)) throw new ConversationError('NOT_FOUND');
    const link = await tx.assistantLink.findUnique({ where: { slug: value } });
    if (!link || !usable(link, this.clock())) throw new ConversationError('NOT_FOUND');
    return link;
  }

  async config(value: string): Promise<PublicAssistant> {
    return this.transaction(async (tx) => {
      const link = await this.link(tx, value);
      const row = await tx.botRelease.findFirstOrThrow({
        where: { id: link.releaseId, organisationId: link.organisationId },
        select: { snapshot: true },
      });
      const knowledge = releaseSnapshotSchema.parse(row.snapshot).knowledge;
      // Suggestions are the approved FAQ questions only; answers and notes stay server-side.
      const suggest = (locale: 'en' | 'ne') =>
        knowledge
          .filter((entry) => entry.type === 'FAQ' && entry.question?.[locale])
          .slice(0, 3)
          .map((entry) => entry.question![locale].slice(0, 500));
      return {
        slug: link.slug,
        providerMode: this.options.providerMode,
        release: await runtimeRelease(tx, link.releaseId, link.organisationId),
        suggestions: { en: suggest('en'), ne: suggest('ne') },
      };
    });
  }

  /** A fresh HttpOnly grant for this link; the caller sets the cookie and returns only CSRF. */
  async grant(value: string): Promise<{ token: string; csrfToken: string; expiresAt: Date }> {
    return this.transaction(async (tx) => {
      const link = await this.link(tx, value);
      const now = this.clock();
      const token = createToken();
      const expiresAt = new Date(now.getTime() + CONVERSATION_LIMITS.grantMinutes * 60000);
      await tx.visitorGrant.create({
        data: {
          organisationId: link.organisationId,
          linkId: link.id,
          tokenHash: hashSecret('visitor-grant', token, this.options.pepper),
          createdAt: now,
          expiresAt,
        },
      });
      return { token, csrfToken: csrfToken(token, this.options.pepper), expiresAt };
    });
  }

  /** Only media the link's pinned release references, and only while the link is usable. */
  async media(value: string, id: string) {
    parse(resourceIdSchema, id);
    const asset = await this.transaction(async (tx) => {
      const link = await this.link(tx, value);
      const referenced = await tx.releaseMedia.findFirst({
        where: { mediaId: id, organisationId: link.organisationId, releaseId: link.releaseId },
        select: { media: true },
      });
      if (!referenced) throw new ConversationError('NOT_FOUND');
      return referenced.media;
    });
    return openReadyMedia(this.storage, asset);
  }
}
