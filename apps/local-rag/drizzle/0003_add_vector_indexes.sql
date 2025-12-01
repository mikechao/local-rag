-- Primary: HNSW
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_hnsw
ON chunk_embeddings USING hnsw (embedding vector_l2_ops)
WITH (m = 16, ef_construction = 64);
--> statement-breakpoint

-- Optional fallback: IVFFlat
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_ivfflat
ON chunk_embeddings USING ivfflat (embedding vector_l2_ops)
WITH (lists = 100);
--> statement-breakpoint

-- Filter helper
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_model
ON chunk_embeddings (embedding_model);
