## Clean Database
Helpful snippet to run in the devtoools console to delete OPFS used by db.worker.ts (PGlite)

Need to renamed the new OpfsAhpFS("local-rag") to new OpfsAhpFS("local-rag-v2") and run pnpm dev then execute the snippet below

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
