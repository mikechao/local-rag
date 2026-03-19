import { desc } from "drizzle-orm";
import { useCallback, useEffect, useState } from "react";
import { type Document, documents } from "@/db/schema";
import { getDb } from "@/lib/db";

export function useDocuments() {
  const [data, setData] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      const db = await getDb();
      const result = await db
        .select()
        .from(documents)
        .orderBy(desc(documents.createdAt));
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  return { data, isLoading, error, refresh: fetchDocuments };
}
