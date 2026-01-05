# RAG Pipeline Analysis & Review

This document outlines the current state of the Retrieval-Augmented Generation (RAG) pipeline and identifies specific areas for accuracy and performance improvements.

## 1. Ingestion & Chunking

### Current State
- **Markdown:** Uses a custom header-aware splitter with context injection.
- **PDF:** Uses `WebPDFLoader` and `RecursiveCharacterTextSplitter`.
- **Chunk Size:** 1000 characters.
- **Overlap:** 200 (Markdown) / 150 (PDF).

### Areas for Improvement
- **PDF Semantic Context:** PDFs currently lack the "Context Breadcrumbs" (`H1 > H2`) found in Markdown. Chunks are split purely by character count, which can sever the relationship between a table/list and its header.
    - **Fix:** Implement a more advanced PDF parser that identifies font styles or structure to extract headers.
- **Table Handling:** Neither splitter specifically handles Markdown or PDF tables. Tables often get sliced in the middle, making them nonsensical to the AI.
    - **Fix:** Use a table-aware splitter or convert tables to a "row-by-row" text representation.

## 2. Retrieval Logic (`retrieval.ts`)

### Current State
- **Hybrid Search:** Combines Vector Similarity (384-dim) and Keyword Trigram Similarity.
- **Re-ranking:** Uses Reciprocal Rank Fusion (RRF) with a 1.5x weight for keyword matches.

### Areas for Improvement
- **Keyword Extraction:** The current `extractKeywords` utility is very basic (space-split + stopword removal). It breaks multi-word entities like "John Sheppard" into separate tokens.
    - **Fix:** Use a small entity-extraction model or preserve n-grams to allow exact phrase matching in the trigram index.
- **Metadata Filtering:** The system lacks the ability to filter by date, file type, or user-defined tags at the query level.
- **Dynamic Weighting:** RRF weights are static. If a query is clearly keyword-heavy ("Who is Joe Flanigan?"), the system should potentially prioritize the keyword index more than for a thematic query ("Tell me about the themes of isolation").

## 3. Re-ranking (`retrieval-pipeline.ts`)

### Current State
- **Model:** `mxbai-rerank-xsmall-v1` (Cross-Encoder).
- **Candidates:** Only the top 10 results from the initial search are re-ranked.
- **Threshold:** 0.75 min score.

### Areas for Improvement
- **Candidate Pool Size:** 10 candidates is quite narrow. If the vector search ranks the "perfect" answer at position 11, the re-ranker never sees it.
    - **Action:** Increase `rerankCandidates` to **30-50**. Since this runs on WebGPU, the performance cost is negligible for a significant accuracy gain.
- **Context Injection for Reranker:** The reranker only sees the chunk text. If we haven't baked the context into the text (which we just fixed for Markdown), the reranker struggles to score short, ambiguous chunks.

## 4. Prompt Engineering (`built-in-ai-chat-transport.ts`) *done*

### Current State
- **System Prompt:** Generic ("You are a helpful assistant").
- **Context Format:** Numbered list `[1]: ...`.

### Areas for Improvement
- **Stricter Constraints:** The generic prompt allows for hallucinations if the answer isn't in the context.
    - **Action:** Update the system prompt to explicitly enforce "Context-only" answering and strict citation rules.
- **Context Formatting:** Adding the document filename and page number inside the injected context would help the LLM provide better citations (e.g., "In `manual.pdf`, page 4...").

## 5. Summary of Recommended Quick Wins

1.  **Increase Rerank Candidates:** Update `retrieval-pipeline.ts` to send 30 results to the reranker instead of 10.
2.  **Strict System Prompt:** Update `built-in-ai-chat-transport.ts` to include "Grounding" instructions.
3.  **Entity Search:** Improve keyword extraction to preserve names and proper nouns.
