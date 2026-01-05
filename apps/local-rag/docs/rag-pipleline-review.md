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
- **Two-Stage Retrieval:**
    1.  **Candidate Generation:** Hybrid Search (Vector Similarity + Keyword Trigram) fetches top 20 candidates from each method.
    2.  **Reranking:** A Cross-Encoder model (`mixedbread-ai/mxbai-rerank-xsmall-v1`) scores all candidates based on query-document relevance.
- **Interleaved Merging:** Candidates from Vector and Keyword search are interleaved to ensure a balanced pool for the reranker.
- **Performance:** Reranking is batched (size 8) and capped at 20 documents to ensure responsiveness on consumer hardware.

### Areas for Improvement
- **Metadata Filtering:** The system lacks the ability to filter by date, file type, or user-defined tags at the query level.
- **Advanced Keyword Extraction:** While the Reranker mitigates the impact of poor keyword splitting (e.g. "John Sheppard" -> "john", "sheppard"), the initial candidate generation could still be improved with a proper Named Entity Recognition (NER) model to preserve multi-word entities as single tokens.

### Completed Improvements
- **Dynamic Weighting:** Replaced static RRF weights with semantic Reranking. The model now automatically determines if a keyword match or a vector match is more relevant for the specific query.

## 3. Re-ranking (`retrieval-pipeline.ts`) *done*

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
