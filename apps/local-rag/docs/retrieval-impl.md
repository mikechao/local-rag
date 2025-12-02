# Retrieval Implementation

This document describes the hybrid search retrieval system used for RAG (Retrieval-Augmented Generation) in the local-rag application.

## Overview

The retrieval system combines two search strategies to find relevant document chunks:

1. **Vector Similarity Search** - Semantic search using embeddings
2. **Trigram Search** - Keyword-based search using PostgreSQL's `pg_trgm` extension

Results from both strategies are merged using **Reciprocal Rank Fusion (RRF)** to produce a final ranked list.

## Why Hybrid Search?

Pure vector similarity search has limitations:

- Embedding models may not capture Q&A relationships well (e.g., "When was X cancelled?" vs "X was cancelled on...")
- Common entity names can dominate similarity scores
- Exact keyword matches may rank lower than semantically similar but less relevant text

Hybrid search addresses these issues by:

- Using trigram matching to boost chunks containing query keywords
- Combining rankings from both methods to surface relevant results that either method alone might miss

## Components

### Embedding Model

- **Model**: `Xenova/all-MiniLM-L6-v2`
- **Dimensions**: 384
- **Source**: [Hugging Face](https://huggingface.co/Xenova/all-MiniLM-L6-v2)

This is a sentence-transformers model optimized for semantic similarity tasks, running client-side via Transformers.js.

### Vector Search

Uses cosine similarity between the query embedding and stored chunk embeddings:

```sql
1 - (embedding <=> query_vector)
```

The `<=>` operator computes cosine distance in pgvector.

### Trigram Search (pg_trgm)

PostgreSQL's `pg_trgm` extension provides trigram-based text similarity:

- **Function**: `word_similarity(query, text)` - Finds how similar query words are to words in the text
- **Operator**: `<%` - Filters chunks where word similarity exceeds threshold (default 0.3)
- **Index**: GIN index on `document_chunks.text` using `gin_trgm_ops` for fast lookups

#### Keyword Extraction

Before trigram search, stop words are filtered from the query:

```typescript
// "When was Stargate Atlantis cancelled?" 
// → ["stargate", "atlantis", "cancelled"]
```

### Reciprocal Rank Fusion (RRF)

RRF combines rankings from multiple search methods using the formula:

```
RRF_score = Σ (1 / (k + rank))
```

Where:
- `k` is a constant (default: 60)
- `rank` is the position in each result list (1-indexed)

Our implementation gives trigram results extra weight (1.5x) since keyword matches often indicate high relevance for factual queries:

```typescript
if (vectorRank !== null) {
    rrfScore += 1 / (RRF_K + vectorRank);
}
if (trigramRank !== null) {
    rrfScore += 1.5 / (RRF_K + trigramRank);
}
```

## Database Schema

### chunk_embeddings table

```sql
CREATE TABLE chunk_embeddings (
    chunk_id TEXT NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
    embedding_model TEXT NOT NULL,
    embedding VECTOR(384) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (chunk_id, embedding_model)
);
```

### Indexes

- **Vector index**: HNSW index on `embedding` column for fast approximate nearest neighbor search
- **Trigram index**: GIN index on `document_chunks.text` for fast trigram lookups

```sql
CREATE INDEX document_chunks_text_trgm_idx 
ON document_chunks USING GIN (text gin_trgm_ops);
```

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `limit` | 10 | Max results per search method |
| `similarityThreshold` | 0.3 | Minimum hybrid score to include |
| `RRF_K` | 60 | RRF constant (higher = more equal weighting) |

## Flow

```
Query: "When was Stargate Atlantis cancelled?"
           │
           ▼
    ┌──────────────┐
    │  Embed Query │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │Extract Keywords│  → ["stargate", "atlantis", "cancelled"]
    └──────┬───────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌─────────┐  ┌─────────┐
│ Vector  │  │ Trigram │
│ Search  │  │ Search  │
└────┬────┘  └────┬────┘
     │            │
     │  Top 10    │  Top 10
     │            │
     └─────┬──────┘
           ▼
    ┌──────────────┐
    │  RRF Merge   │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │   Filter &   │
    │    Return    │
    └──────────────┘
```

## Files

- `src/lib/retrieval.ts` - Main retrieval logic
- `src/lib/models/embeddingModel.ts` - Embedding model configuration
- `src/lib/embedding-worker.ts` - Worker client for embeddings
- `src/workers/embedding.worker.ts` - Web worker for embedding computation
- `src/workers/db.worker.ts` - PGlite database worker (includes pg_trgm extension)
- `src/lib/migrations.ts` - Database migrations and extension setup
- `src/db/schema.ts` - Drizzle ORM schema definitions

## Future Improvements

- **Query expansion**: Reformulate queries to include answer patterns
- **Cross-encoder re-ranking**: Use a more accurate model to re-rank top results
- **Adjustable RRF weights**: Allow tuning vector vs trigram importance per query type
- **Full-text search**: Add PostgreSQL full-text search (`tsvector`) for additional signal
