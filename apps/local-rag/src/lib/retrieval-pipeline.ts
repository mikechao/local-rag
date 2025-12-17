import type { RetrievalStatus } from "./local-rag-message";
import type { RetrievalResult } from "./retrieval";
import { retrieveChunks } from "./retrieval";
import {
  hasCachedRerankerWeights,
  isRerankerModelReadyFlag,
  rerank,
} from "./models/rerankerModel";

type WriteStatus = (status: RetrievalStatus) => void;

export type RetrievalPipelineOptions = {
  rerankCandidates?: number;
};

export async function runRetrievalPipeline(
  userQuestion: string,
  {
    abortSignal,
    writeStatus,
    options,
  }: {
    abortSignal?: AbortSignal;
    writeStatus: WriteStatus;
    options?: RetrievalPipelineOptions;
  },
): Promise<RetrievalResult[]> {
  const rerankCandidates = options?.rerankCandidates ?? 10;

  writeStatus({
    phase: "retrieving",
    query: userQuestion,
    message: "Searching the knowledge base…",
  });

  const retrievalBefore = performance.now();
  const retrievalResponse = await retrieveChunks(userQuestion);
  const retrievalAfter = performance.now();

  let results = retrievalResponse.results;

  // Only rerank when the reranker is already cached/marked ready.
  const rerankerAvailable =
    isRerankerModelReadyFlag() || (await hasCachedRerankerWeights());

  if (
    rerankerAvailable &&
    results.length > 1 &&
    !abortSignal?.aborted &&
    results.some((r) => r.text?.trim())
  ) {
    const rerankBefore = performance.now();
    writeStatus({
      phase: "reranking",
      query: userQuestion,
      message: "Reranking results…",
    });

    const candidates = results.slice(0, rerankCandidates);
    const candidateTexts = candidates.map((r) => r.text);

    try {
      const reranked = await rerank(
        userQuestion,
        candidateTexts,
        { top_k: candidates.length },
        undefined,
      );

      const reordered: RetrievalResult[] = [];
      const used = new Set<number>();

      for (const { corpus_id, score } of reranked) {
        const item = candidates[corpus_id];
        if (!item) continue;
        used.add(corpus_id);
        reordered.push({ ...item, rerankScore: score });
      }

      for (let i = 0; i < candidates.length; i += 1) {
        if (used.has(i)) continue;
        reordered.push(candidates[i]);
      }

      results = [...reordered, ...results.slice(candidates.length)];
      const rerankAfter = performance.now();

      console.log(
        `reranking took ${rerankAfter - rerankBefore} ms for ${candidates.length} candidates`,
      );
    } catch (e) {
      console.warn("[retrieval] reranking failed (continuing):", e);
    }
  }

  writeStatus({
    phase: "done",
    resultsCount: results.length,
    tookMs: Math.round(retrievalAfter - retrievalBefore),
    message:
      results.length === 0
        ? "No relevant sources found."
        : `Found ${results.length} source${results.length === 1 ? "" : "s"}.`,
  });

  return results;
}
