import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { WebPDFLoader } from "@langchain/community/document_loaders/web/pdf";

export type ChunkingProgress = {
  docId: string;
  filename: string;
  stage: "download" | "split";
  bytesDone?: number;
  bytesTotal?: number;
  pagesDone?: number;
  pagesTotal?: number;
  chunksDone?: number;
  chunksTotal?: number;
};

export type ChunkResult = {
  docId: string;
  docType: "markdown" | "pdf";
  chunks: {
    pageNumber: number;
    chunkIndex: number;
    text: string;
    headingPath?: string;
  }[];
};

/**
 * Strip markdown link syntax to plain text for better semantic embedding.
 * Converts [text](url) to just text, and ![alt](url) to alt.
 */
function stripMarkdownLinks(text: string): string {
  // Remove image links ![alt](url) -> alt
  let cleaned = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  // Remove regular links [text](url) -> text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return cleaned;
}

/**
 * Simple helper to split markdown by headers and preserve hierarchy.
 * Returns segments with their full heading path.
 */
function splitByHeaders(text: string): { content: string; path: string }[] {
  const lines = text.split(/\r?\n/);
  const segments: { content: string; path: string }[] = [];

  let currentPath: string[] = [];
  let currentContent: string[] = [];

  // Regex to match headers: # Header
  const headerRegex = /^(#{1,6})\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(headerRegex);
    if (match) {
      // If we have accumulated content, push it with the PREVIOUS path
      if (currentContent.length > 0) {
        segments.push({
          content: currentContent.join("\n"),
          path: currentPath.join(" > "),
        });
        currentContent = [];
      }

      const level = match[1].length;
      const title = match[2].trim();

      // Adjust path based on header level
      // If level is deeper or same, we might just append?
      // Actually simpler logic:
      // If level 1 (#), reset everything.
      // If level 2 (##), keep level 1.
      // We need to maintain a stack of headers.

      // Filter out headers that are deeper or equal to current level to "pop" the stack
      // This is a naive heuristic: strictly maintain stack size = level - 1
      // But markdown can skip levels.
      // Better approach: resize stack to level-1

      if (level === 1) {
        currentPath = [title];
      } else {
        // e.g. level 3. Stack should be at most 2 items deep before pushing.
        // If stack is [H1, H2, H3], and we get H2, we want [H1, NewH2]
        // If stack is [H1], and we get H3, we just do [H1, H3] (skipping H2 is valid md)

        // We trim the stack to be at most level-1
        // But we need to handle the case where we skip levels (H1 -> H3).
        // Let's just slice the array.
        currentPath = currentPath.slice(0, level - 1);
        currentPath.push(title);
      }
    } else {
      currentContent.push(line);
    }
  }

  // Push remaining content
  if (currentContent.length > 0) {
    segments.push({
      content: currentContent.join("\n"),
      path: currentPath.join(" > "),
    });
  }

  return segments;
}

export async function processMarkdown(
  docId: string,
  filename: string,
  blob: Blob,
  onProgress?: (progress: ChunkingProgress) => void,
): Promise<ChunkResult> {
  const rawText = await blob.text();

  // 1. Split by headers first to get semantic sections
  const sections = splitByHeaders(rawText);

  // 2. Configure splitter for larger chunks
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000, // Larger chunks for better context preservation
    chunkOverlap: 200,
  });

  const allChunks: ChunkResult["chunks"] = [];
  let chunkGlobalIndex = 0;

  for (const section of sections) {
    // Clean the content (strip links)
    const cleanContent = stripMarkdownLinks(section.content);
    if (!cleanContent.trim()) continue;

    const docs = await splitter.createDocuments([cleanContent]);

    for (const doc of docs) {
      // 3. Prepend context to the text for the AI
      const contextPrefix = section.path ? `Context: ${section.path}\n\n` : "";
      const finalText = contextPrefix + doc.pageContent;

      allChunks.push({
        pageNumber: 1, // Markdown is treated as single page for now
        chunkIndex: chunkGlobalIndex++,
        text: finalText,
        headingPath: section.path || undefined,
      });
    }
  }

  if (onProgress) {
    onProgress({
      docId,
      filename,
      stage: "split",
      chunksDone: allChunks.length,
      chunksTotal: allChunks.length,
    });
  }

  return {
    docId,
    docType: "markdown",
    chunks: allChunks,
  };
}

export async function processPdf(
  docId: string,
  filename: string,
  blob: Blob,
  onProgress?: (progress: ChunkingProgress) => void,
): Promise<ChunkResult> {
  // WebPDFLoader loads the PDF
  const loader = new WebPDFLoader(blob, {
    // We can add splitPages: false if we want to handle splitting manually,
    // but WebPDFLoader returns one document per page by default.
    parsedItemSeparator: "",
  });

  const docs = await loader.load();
  const totalPages = docs.length;

  if (onProgress) {
    onProgress({
      docId,
      filename,
      stage: "split",
      pagesDone: 0,
      pagesTotal: totalPages,
    });
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 150,
  });

  const allChunks: ChunkResult["chunks"] = [];
  let chunkGlobalIndex = 0;

  for (let i = 0; i < docs.length; i++) {
    const pageDoc = docs[i];
    const pageNumber = i + 1; // 1-based

    // Split this page
    const pageChunks = await splitter.splitDocuments([pageDoc]);

    for (const chunk of pageChunks) {
      allChunks.push({
        pageNumber: pageNumber,
        chunkIndex: chunkGlobalIndex++,
        text: chunk.pageContent,
        // PDF loader doesn't give heading path easily without extra work
        headingPath: undefined,
      });
    }

    if (onProgress) {
      onProgress({
        docId,
        filename,
        stage: "split",
        pagesDone: pageNumber,
        pagesTotal: totalPages,
        chunksDone: allChunks.length,
      });
    }
  }

  return {
    docId,
    docType: "pdf",
    chunks: allChunks,
  };
}
