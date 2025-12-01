import { MarkdownTextSplitter, RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
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

export async function processMarkdown(
    docId: string,
    filename: string,
    blob: Blob,
    onProgress?: (progress: ChunkingProgress) => void
): Promise<ChunkResult> {
    const text = await blob.text();
    const splitter = new MarkdownTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 150,
    });

    const docs = await splitter.createDocuments([text]);
    
    // MarkdownTextSplitter doesn't give us page numbers, but we can treat it as page 1
    // It might give us header metadata if we configured it, but basic usage just splits text.
    // Let's see if we can extract headers. MarkdownTextSplitter preserves headers in metadata if configured?
    // Actually, RecursiveCharacterTextSplitter is the base. MarkdownTextSplitter just has specific separators.
    
    // For now, simple mapping
    const chunks = docs.map((doc, index) => ({
        pageNumber: 1,
        chunkIndex: index,
        text: doc.pageContent,
        headingPath: doc.metadata.header // This might need adjustment depending on how we want to capture headers
    }));

    if (onProgress) {
        onProgress({
            docId,
            filename,
            stage: "split",
            chunksDone: chunks.length,
            chunksTotal: chunks.length
        });
    }

    return {
        docId,
        docType: "markdown",
        chunks
    };
}

export async function processPdf(
    docId: string,
    filename: string,
    blob: Blob,
    onProgress?: (progress: ChunkingProgress) => void
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
            pagesTotal: totalPages
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
                headingPath: undefined 
            });
        }

        if (onProgress) {
            onProgress({
                docId,
                filename,
                stage: "split",
                pagesDone: pageNumber,
                pagesTotal: totalPages,
                chunksDone: allChunks.length
            });
        }
    }

    return {
        docId,
        docType: "pdf",
        chunks: allChunks
    };
}
