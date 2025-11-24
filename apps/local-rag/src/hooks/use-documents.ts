import { useState, useEffect, useCallback } from "react";
import { getDb } from "@/lib/db";
import { documents, type Document } from "@/db/schema";
import { desc } from "drizzle-orm";

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
