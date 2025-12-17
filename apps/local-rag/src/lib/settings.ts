import { eq, sql } from "drizzle-orm";
import { appSettings } from "@/db/schema";
import { ensureDbReady, getDb } from "@/lib/db";

export const DEFAULT_RERANK_MIN_SCORE = 0.75;

function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RERANK_MIN_SCORE;
  return Math.max(0, Math.min(1, value));
}

let cachedRerankMinScore: number | null = null;

export async function getRerankMinScore(): Promise<number> {
  if (cachedRerankMinScore !== null) return cachedRerankMinScore;

  await ensureDbReady();
  const db = await getDb();

  const rows = await db
    .select({ rerankMinScore: appSettings.rerankMinScore })
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);

  if (rows.length === 0) {
    await db.insert(appSettings).values({ id: 1 }).onConflictDoNothing();
    cachedRerankMinScore = DEFAULT_RERANK_MIN_SCORE;
    return cachedRerankMinScore;
  }

  cachedRerankMinScore = normalizeScore(rows[0].rerankMinScore);
  return cachedRerankMinScore;
}

export async function setRerankMinScore(value: number): Promise<number> {
  const normalized = normalizeScore(value);
  await ensureDbReady();
  const db = await getDb();

  await db
    .insert(appSettings)
    .values({ id: 1, rerankMinScore: normalized })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: {
        rerankMinScore: normalized,
        updatedAt: sql`now()`,
      },
    });

  cachedRerankMinScore = normalized;
  return normalized;
}

export function resetSettingsCache() {
  cachedRerankMinScore = null;
}
