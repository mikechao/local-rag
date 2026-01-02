import type { RetrievalStatus } from "./local-rag-message";
import type { RetrievalResult } from "./retrieval";
import { retrieveChunks } from "./retrieval";
import { rerank } from "./models/rerankerModel";
import { isModelAvailable } from "./models/model-registry";

type WriteStatus = (status: RetrievalStatus) => void;

export type RetrievalPipelineOptions = {
  rerankCandidates?: number;
  rerankMinScore?: number;
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
  const rerankMinScore = options?.rerankMinScore ?? 0.75;

  writeStatus({
    phase: "retrieving",
    query: userQuestion,
    message: "Searching the knowledge base…",
  });

  const retrievalBefore = performance.now();
  const rerankerAvailabilityPromise = isModelAvailable("reranker");
  const [retrievalResponse, rerankerAvailable] = await Promise.all([
    retrieveChunks(userQuestion),
    rerankerAvailabilityPromise,
  ]);
  const retrievalAfter = performance.now();

  let results = retrievalResponse.results;

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
      let filteredCount = 0;

      for (const { corpus_id, score } of reranked) {
        const item = candidates[corpus_id];
        if (!item) continue;

        if (score < rerankMinScore) {
          filteredCount += 1;
          continue;
        }
        reordered.push({ ...item, rerankScore: score });
      }

      // Optimization: When reranker is active, ONLY return the reranked and filtered results.
      // We discard the 'tail' (results.slice(candidates.length)) because:
      // 1. They weren't good enough to be in the top candidates.
      // 2. They haven't been verified by the reranker.
      // 3. Including them bloats the prompt context, slowing down the LLM's TTFT (Time To First Token).
      results = reordered;

      const rerankAfter = performance.now();

      console.log(
        `reranking took ${rerankAfter - rerankBefore} ms for ${candidates.length} candidates`,
      );
      if (filteredCount > 0) {
        console.log(
          `[retrieval] filtered ${filteredCount} reranked candidates below rerankMinScore=${rerankMinScore}`,
        );
      }
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
