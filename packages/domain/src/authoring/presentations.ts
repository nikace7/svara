import type { Prisma } from '@svara/database';
import {
  PRESENTATION_LIMITS,
  presentationCreateSchema,
  presentationSaveSchema,
  presentationDeleteSchema,
  presentationSelectionSchema,
  presentationDetailSchema,
  resourceIdSchema,
  slideCreateSchema,
  slideSaveSchema,
  slideDeleteSchema,
  slideOrderSchema,
  slideTranslationErrors,
} from '@svara/contracts';
import type { PresentationDetail, PresentationList, PresentationSelection } from '@svara/contracts';
import type { IdentityService } from '../identity/service.js';
import { IdentityError } from '../identity/errors.js';
import { MediaError } from '../media/errors.js';
import { mediaDetail } from '../media/service.js';
import { AuthoringError } from './errors.js';

const include = {
  bot: { include: { draft: true } },
  slides: { include: { media: true }, orderBy: { position: 'asc' } },
} as const;
type Stored = Prisma.PresentationGetPayload<{ include: typeof include }>;
type Transaction = Prisma.TransactionClient;
type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };
function parse<T>(schema: Schema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new IdentityError('INVALID_INPUT');
  return result.data;
}
function mutation<T>(schema: Schema<T>, value: unknown): T {
  if (value && typeof value === 'object' && !('expectedRevision' in value))
    throw new AuthoringError('PRECONDITION_REQUIRED');
  return parse(schema, value);
}
function summary(presentation: Omit<Stored, 'bot' | 'slides'>, slideCount: number) {
  return {
    id: presentation.id,
    botId: presentation.botId,
    name: presentation.name,
    revision: presentation.revision,
    updatedAt: presentation.updatedAt.toISOString(),
    slideCount,
  };
}
function detail(presentation: Stored): PresentationDetail {
  return presentationDetailSchema.parse({
    ...summary(presentation, presentation.slides.length),
    botRevision: presentation.bot.revision,
    botArchivedAt: presentation.bot.archivedAt?.toISOString() ?? null,
    selected: presentation.bot.draft?.presentationId === presentation.id,
    slides: presentation.slides.map((slide) => {
      const title = { en: slide.titleEn, ne: slide.titleNe };
      const body = { en: slide.bodyEn, ne: slide.bodyNe };
      const missing = slideTranslationErrors({ title, body });
      return {
        id: slide.id,
        presentationId: slide.presentationId,
        position: slide.position,
        revision: slide.revision,
        title,
        body,
        target: slide.target,
        durationSeconds: slide.durationSeconds,
        mediaId: slide.mediaId,
        media: slide.media ? mediaDetail(slide.media) : null,
        complete: {
          en: !missing['title.en'] && !missing['body.en'],
          ne: !missing['title.ne'] && !missing['body.ne'],
        },
      };
    }),
  });
}
function check(
  bot: { revision: number; archivedAt: Date | null },
  current: number,
  expected: number,
) {
  if (current !== expected) throw new AuthoringError('REVISION_CONFLICT', current);
  if (bot.archivedAt) throw new AuthoringError('ARCHIVED', current);
}
function slideData(input: ReturnType<typeof slideSaveSchema.parse>) {
  return {
    titleEn: input.title.en,
    titleNe: input.title.ne,
    bodyEn: input.body.en,
    bodyNe: input.body.ne,
    target: input.target,
    durationSeconds: input.durationSeconds,
    mediaId: input.mediaId,
    mediaState: input.mediaId ? ('READY' as const) : null,
  };
}

export class PresentationService {
  constructor(private readonly identity: IdentityService) {}
  private async bot(tx: Transaction, organisationId: string, id: string) {
    const bot = await tx.bot.findFirst({ where: { id, organisationId }, include: { draft: true } });
    if (!bot) throw new IdentityError('NOT_FOUND');
    if (!bot.draft) throw new Error('Bot draft is missing.');
    return bot;
  }
  private async load(tx: Transaction, organisationId: string, id: string): Promise<Stored> {
    const found = await tx.presentation.findFirst({ where: { id, organisationId }, include });
    if (!found) throw new IdentityError('NOT_FOUND');
    return found;
  }
  private async fromSlide(tx: Transaction, organisationId: string, id: string) {
    const slide = await tx.slide.findFirst({
      where: { id, organisationId },
      select: { presentationId: true },
    });
    if (!slide) throw new IdentityError('NOT_FOUND');
    return this.load(tx, organisationId, slide.presentationId);
  }
  private async audit(
    tx: Transaction,
    organisationId: string,
    actorMembershipId: string,
    action: string,
    targetId: string,
  ) {
    await tx.auditEntry.create({ data: { organisationId, actorMembershipId, action, targetId } });
  }
  private async bumpBot(tx: Transaction, botId: string, organisationId: string) {
    return tx.bot.update({
      where: { id_organisationId: { id: botId, organisationId } },
      data: { revision: { increment: 1 } },
    });
  }
  private async readyMedia(tx: Transaction, organisationId: string, id: string | null) {
    if (!id) return;
    const asset = await tx.mediaAsset.findFirst({ where: { id, organisationId } });
    if (!asset) throw new IdentityError('NOT_FOUND');
    if (asset.state !== 'READY') throw new MediaError('MEDIA_NOT_READY');
  }
  private async edit(
    token: string,
    id: string,
    expectedRevision: number,
    action: string,
    run: (tx: Transaction, current: Stored) => Promise<void>,
    slide = false,
  ): Promise<PresentationDetail> {
    parse(resourceIdSchema, id);
    return this.identity.asStaff(token, 'author', async (tx, { member }) => {
      const current = await (slide
        ? this.fromSlide(tx, member.organisationId, id)
        : this.load(tx, member.organisationId, id));
      const revision = slide
        ? current.slides.find((entry) => entry.id === id)!.revision
        : current.revision;
      check(current.bot, revision, expectedRevision);
      await run(tx, current);
      await this.bumpBot(tx, current.botId, member.organisationId);
      await tx.presentation.update({
        where: { id_organisationId: { id: current.id, organisationId: member.organisationId } },
        data: { revision: { increment: 1 } },
      });
      await this.audit(tx, member.organisationId, member.id, action, id);
      return detail(await this.load(tx, member.organisationId, current.id));
    });
  }
  async create(token: string, value: unknown): Promise<PresentationDetail> {
    const data = parse(presentationCreateSchema, value);
    return this.identity.asStaff(token, 'author', async (tx, { member }) => {
      const bot = await this.bot(tx, member.organisationId, data.botId);
      check(bot, bot.revision, bot.revision);
      if (
        (await tx.presentation.count({
          where: { botId: bot.id, organisationId: member.organisationId },
        })) >= PRESENTATION_LIMITS.perBot
      )
        throw new AuthoringError('PRESENTATION_LIMIT');
      const created = await tx.presentation.create({
        data: { ...data, organisationId: member.organisationId },
      });
      if (!bot.draft!.presentationId)
        await tx.botDraft.update({
          where: { botId: bot.id },
          data: { presentationId: created.id },
        });
      await this.bumpBot(tx, bot.id, member.organisationId);
      await this.audit(tx, member.organisationId, member.id, 'presentation.created', created.id);
      return detail(await this.load(tx, member.organisationId, created.id));
    });
  }
  async get(token: string, id: string): Promise<PresentationDetail> {
    parse(resourceIdSchema, id);
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => detail(await this.load(tx, member.organisationId, id)),
      false,
    );
  }
  async list(token: string, botId: string): Promise<PresentationList> {
    parse(resourceIdSchema, botId);
    return this.identity.asStaff(
      token,
      'inspect',
      async (tx, { member }) => {
        const bot = await this.bot(tx, member.organisationId, botId);
        const entries = await tx.presentation.findMany({
          where: { botId, organisationId: member.organisationId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: PRESENTATION_LIMITS.perBot,
          include: { _count: { select: { slides: true } } },
        });
        return {
          botId,
          botRevision: bot.revision,
          botArchivedAt: bot.archivedAt?.toISOString() ?? null,
          selectedPresentationId: bot.draft!.presentationId,
          items: entries.map((entry) => summary(entry, entry._count.slides)),
        };
      },
      false,
    );
  }
  async save(token: string, id: string, value: unknown): Promise<PresentationDetail> {
    const input = mutation(presentationSaveSchema, value);
    return this.edit(
      token,
      id,
      input.expectedRevision,
      'presentation.saved',
      async (tx, current) => {
        await tx.presentation.update({ where: { id: current.id }, data: { name: input.name } });
      },
    );
  }
  async select(token: string, botId: string, value: unknown): Promise<PresentationSelection> {
    parse(resourceIdSchema, botId);
    const input = mutation(presentationSelectionSchema, value);
    return this.identity.asStaff(token, 'author', async (tx, { member }) => {
      const bot = await this.bot(tx, member.organisationId, botId);
      check(bot, bot.revision, input.expectedRevision);
      if (input.presentationId) {
        const presentation = await this.load(tx, member.organisationId, input.presentationId);
        if (presentation.botId !== botId) throw new IdentityError('NOT_FOUND');
      }
      await tx.botDraft.update({
        where: { botId },
        data: { presentationId: input.presentationId },
      });
      const updated = await this.bumpBot(tx, botId, member.organisationId);
      await this.audit(tx, member.organisationId, member.id, 'presentation.selected', botId);
      return { presentationId: input.presentationId, botRevision: updated.revision };
    });
  }
  async remove(
    token: string,
    id: string,
    value: unknown,
  ): Promise<{ ok: true; botRevision: number }> {
    parse(resourceIdSchema, id);
    const input = mutation(presentationDeleteSchema, value);
    return this.identity.asStaff(token, 'author', async (tx, { member }) => {
      const current = await this.load(tx, member.organisationId, id);
      check(current.bot, current.revision, input.expectedRevision);
      await tx.botDraft.updateMany({
        where: { botId: current.botId, organisationId: member.organisationId, presentationId: id },
        data: { presentationId: null },
      });
      await tx.presentation.delete({
        where: { id_organisationId: { id, organisationId: member.organisationId } },
      });
      const bot = await this.bumpBot(tx, current.botId, member.organisationId);
      await this.audit(tx, member.organisationId, member.id, 'presentation.deleted', id);
      return { ok: true, botRevision: bot.revision };
    });
  }
  async createSlide(token: string, id: string, value: unknown): Promise<PresentationDetail> {
    const input = mutation(slideCreateSchema, value);
    return this.edit(token, id, input.expectedRevision, 'slide.created', async (tx, current) => {
      if (current.slides.length >= PRESENTATION_LIMITS.slides)
        throw new AuthoringError('SLIDE_LIMIT');
      await this.readyMedia(tx, current.organisationId, input.mediaId);
      await tx.slide.create({
        data: {
          ...slideData(input),
          organisationId: current.organisationId,
          presentationId: current.id,
          position: current.slides.length,
        },
      });
    });
  }
  async saveSlide(token: string, id: string, value: unknown): Promise<PresentationDetail> {
    const input = mutation(slideSaveSchema, value);
    return this.edit(
      token,
      id,
      input.expectedRevision,
      'slide.saved',
      async (tx, current) => {
        await this.readyMedia(tx, current.organisationId, input.mediaId);
        await tx.slide.update({
          where: { id_organisationId: { id, organisationId: current.organisationId } },
          data: { ...slideData(input), revision: { increment: 1 } },
        });
      },
      true,
    );
  }
  private async positions(tx: Transaction, slides: Stored['slides'], ids: string[]) {
    await tx.$executeRaw`SET CONSTRAINTS "Slide_presentationId_position_key" DEFERRED`;
    const positions = new Map(slides.map((slide) => [slide.id, slide.position]));
    for (const [position, id] of ids.entries()) {
      if (positions.get(id) === position) continue;
      await tx.slide.update({ where: { id }, data: { position, revision: { increment: 1 } } });
    }
  }
  async removeSlide(token: string, id: string, value: unknown): Promise<PresentationDetail> {
    const input = mutation(slideDeleteSchema, value);
    return this.edit(
      token,
      id,
      input.expectedRevision,
      'slide.deleted',
      async (tx, current) => {
        await tx.slide.delete({
          where: { id_organisationId: { id, organisationId: current.organisationId } },
        });
        await this.positions(
          tx,
          current.slides,
          current.slides.filter((slide) => slide.id !== id).map((slide) => slide.id),
        );
      },
      true,
    );
  }
  async reorder(token: string, id: string, value: unknown): Promise<PresentationDetail> {
    const input = mutation(slideOrderSchema, value);
    return this.edit(
      token,
      id,
      input.expectedRevision,
      'presentation.reordered',
      async (tx, current) => {
        const currentIds = new Set(current.slides.map((slide) => slide.id));
        if (
          input.slideIds.length !== currentIds.size ||
          input.slideIds.some((slideId) => !currentIds.has(slideId))
        )
          throw new AuthoringError('INVALID_SLIDE_ORDER', current.revision);
        await this.positions(tx, current.slides, input.slideIds);
      },
    );
  }
}
