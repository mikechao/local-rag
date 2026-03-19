import type { RetrievalStatus } from "./local-rag-message";
import type { RetrievalResult } from "./retrieval";
import { retrieveChunks } from "./retrieval";

type WriteStatus = (status: RetrievalStatus) => void;

export type RetrievalPipelineOptions = {
  rerankCandidates?: number;
  rerankMinScore?: number;
};

export async function runRetrievalPipeline(
  userQuestion: string,
  {
    abortSignal: _abortSignal,
    writeStatus,
    options,
  }: {
    abortSignal?: AbortSignal;
    writeStatus: WriteStatus;
    options?: RetrievalPipelineOptions;
  },
): Promise<RetrievalResult[]> {
  const rerankMinScore = options?.rerankMinScore ?? 0.75;

  writeStatus({
    phase: "retrieving",
    query: userQuestion,
    message: "Searching the knowledge base…",
  });

  const retrievalBefore = performance.now();

  // Note: Reranking is now handled internally by retrieveChunks if the model is available.
  // We pass rerankMinScore as the similarityThreshold so it filters correctly.
  const retrievalResponse = await retrieveChunks(userQuestion, {
    similarityThreshold: rerankMinScore,
    // limits, etc. are handled by defaults or could be exposed here
  });

  const retrievalAfter = performance.now();
  const results = retrievalResponse.results;

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
