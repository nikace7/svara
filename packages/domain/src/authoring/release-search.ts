import type { Prisma } from '@svara/database';
import { RELEASE_LIMITS, releaseSearchResultSchema } from '@svara/contracts';
import type { ReleaseSearchResult } from '@svara/contracts';

type Ranked = { entryId: string; title: string; question: string; content: string; score: number };
export async function searchRelease(
  tx: Prisma.TransactionClient,
  organisationId: string,
  releaseId: string,
  snapshotHash: string,
  locale: 'en' | 'ne',
  query: string,
): Promise<ReleaseSearchResult> {
  // Transaction-local operator threshold, never a pooled connection-wide setting.
  await tx.$queryRaw`SELECT set_config('pg_trgm.similarity_threshold', ${String(RELEASE_LIMITS.trigramThreshold)}, true)`;
  const rows = await tx.$queryRaw<Ranked[]>`
    SELECT "entryId", "title", "question", "content",
      (CASE WHEN "normalizedQuestion" = ${query} THEN 3.0
        WHEN strpos("searchText", ${query}) > 0 THEN 2.0 ELSE 0.0 END
        + CASE WHEN ${locale} = 'en' THEN coalesce(ts_rank_cd("searchVector", plainto_tsquery('english', ${query})), 0) ELSE 0 END
        + greatest(similarity("searchText", ${query}), similarity("normalizedQuestion", ${query})))::float8 AS score
    FROM "ReleaseKnowledge"
    WHERE "organisationId" = ${organisationId}::uuid AND "releaseId" = ${releaseId}::uuid
      AND "snapshotHash" = ${snapshotHash} AND "locale" = ${locale}
      AND ("normalizedQuestion" = ${query} OR strpos("searchText", ${query}) > 0
        OR (${locale} = 'en' AND "searchVector" @@ plainto_tsquery('english', ${query}))
        OR "searchText" % ${query} OR "normalizedQuestion" % ${query})
    ORDER BY score DESC, "entryId" ASC LIMIT ${RELEASE_LIMITS.passages}
  `;
  let remaining: number = RELEASE_LIMITS.passageCharacters;
  const passages: ReleaseSearchResult['passages'] = [];
  for (const row of rows) {
    const headerCharacters = Array.from(`${row.title}\n${row.question}\n`).length;
    if (remaining <= headerCharacters) break;
    const content = Array.from(row.content);
    const text = content.slice(0, remaining - headerCharacters).join('');
    passages.push({
      entryId: row.entryId,
      title: row.title,
      question: row.question,
      text,
      score: row.score,
      truncated: text.length < row.content.length,
    });
    remaining -= headerCharacters + Array.from(text).length;
  }
  return releaseSearchResultSchema.parse({ releaseId, snapshotHash, locale, passages });
}
