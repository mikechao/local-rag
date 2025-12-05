## Clean Database
Helpful snippet to run in the devtoools console to delete OPFS used by db.worker.ts (PGlite)

Need to renamed the new OpfsAhpFS("local-rag") to new OpfsAhpFS("local-rag-v2") and run pnpm dev then execute the snippet below

```javascript
(async () => {
  const root = await navigator.storage.getDirectory();
  try {
    // PGlite usually creates a directory matching the name passed to it
    await root.removeEntry("local-rag", { recursive: true });
    console.log("✅ Database deleted successfully.");
  } catch (e) {
    console.log("⚠️ Could not delete 'local-rag' directory directly. Listing all entries...");
    // Fallback: delete everything in OPFS to be sure
    for await (const [name, handle] of root.entries()) {
        await root.removeEntry(name, { recursive: true });
        console.log(`Deleted: ${name}`);
    }
    console.log("✅ All OPFS data cleared.");
  }
})();
```

## retrieval perf logs
below are logs when I added code like the following to each step in retrieval.ts

```javascript
		performance.mark("retrieval:embed-query-start");
		const queryEmbedding = await embedQuery(query);
		const vectorStr = JSON.stringify(queryEmbedding);
		performance.mark("retrieval:embed-query-end");
		performance.measure(
			"retrieval:embed-query",
			"retrieval:embed-query-start",
			"retrieval:embed-query-end",
		);
```

```
LOG /src/lib/retrieval.ts:303:4 - http://localhost:3000/__tsd/open-source?source=%2Fsrc%2Flib%2Fretrieval.ts%3A303%3A4
 →  retrieval:embed-query took 145.40 ms
retrieval.ts:303 LOG /src/lib/retrieval.ts:303:4 - http://localhost:3000/__tsd/open-source?source=%2Fsrc%2Flib%2Fretrieval.ts%3A303%3A4
 →  retrieval:vector-search took 41.30 ms
retrieval.ts:303 LOG /src/lib/retrieval.ts:303:4 - http://localhost:3000/__tsd/open-source?source=%2Fsrc%2Flib%2Fretrieval.ts%3A303%3A4
 →  retrieval:trigram-search took 35.50 ms
retrieval.ts:303 LOG /src/lib/retrieval.ts:303:4 - http://localhost:3000/__tsd/open-source?source=%2Fsrc%2Flib%2Fretrieval.ts%3A303%3A4
 →  retrieval:rrf took 0.10 ms
retrieval.ts:303 LOG /src/lib/retrieval.ts:303:4 - http://localhost:3000/__tsd/open-source?source=%2Fsrc%2Flib%2Fretrieval.ts%3A303%3A4
 →  retrieval:filter took 0.00 ms
retrieval.ts:303 LOG /src/lib/retrieval.ts:303:4 - http://localhost:3000/__tsd/open-source?source=%2Fsrc%2Flib%2Fretrieval.ts%3A303%3A4
 →  retrieval:group took 0.00 ms
retrieval.ts:303 LOG /src/lib/retrieval.ts:303:4 - http://localhost:3000/__tsd/open-source?source=%2Fsrc%2Flib%2Fretrieval.ts%3A303%3A4
 →  retrieval:merge took 0.10 ms
retrieval.ts:303 LOG /src/lib/retrieval.ts:303:4 - http://localhost:3000/__tsd/open-source?source=%2Fsrc%2Flib%2Fretrieval.ts%3A303%3A4
 →  retrieval:deduplicate took 0.00 ms
client-side-chat-transport.ts:76 LOG /src/lib/client-side-chat-transport.ts:76:13 - http://localhost:3000/__tsd/open-source?source=%2Fsrc%2Flib%2Fclient-side-chat-transport.ts%3A76%3A13
 →  Retrieval took 225.5 ms
```

                                                                         │
│                     Update available v2.6.1 ≫ v2.6.3                     │
│    Changelog: https://github.com/vercel/turborepo/releases/tag/v2.6.3    │
│          Run "pnpm dlx @turbo/codemod@latest update" to update           │
│                                                                          │
│          Follow @turborepo for updates: https://x.com/turborepo