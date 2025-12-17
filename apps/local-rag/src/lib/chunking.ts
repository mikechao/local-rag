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

export async function processMarkdown(
  docId: string,
  filename: string,
  blob: Blob,
  onProgress?: (progress: ChunkingProgress) => void,
): Promise<ChunkResult> {
  const rawText = await blob.text();

  // Strip markdown links to improve semantic embedding quality
  // This converts [text](url) to plain text so embeddings focus on content, not URLs
  const text = stripMarkdownLinks(rawText);

  const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
    chunkSize: 512, // Larger chunks for better context preservation
    chunkOverlap: 50,
  });

  const docs = await splitter.createDocuments([text]);

  const chunks = docs.map((doc, index) => ({
    pageNumber: 1,
    chunkIndex: index,
    text: doc.pageContent,
    headingPath: undefined, // We can improve this later with MarkdownHeaderTextSplitter
  }));

  if (onProgress) {
    onProgress({
      docId,
      filename,
      stage: "split",
      chunksDone: chunks.length,
      chunksTotal: chunks.length,
    });
  }

  return {
    docId,
    docType: "markdown",
    chunks,
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
