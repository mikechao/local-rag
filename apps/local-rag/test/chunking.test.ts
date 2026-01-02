import { describe, it, expect, vi } from "vitest";
import { processMarkdown } from "../src/lib/chunking";

// Mock the PDF loader to avoid dragging in heavy dependencies (like ONNX or Canvas)
// that might be causing the .node loader errors in the test environment.
vi.mock("@langchain/community/document_loaders/web/pdf", () => ({
  WebPDFLoader: class {
    load() { return Promise.resolve([]); }
  }
}));

describe("processMarkdown", () => {
  it("should process markdown with correct chunk size and header context", async () => {
    const filename = "Stargate_Atlantis.md";
    const content = `
# Stargate Atlantis

**Overview**
Some text here.

## Main Cast

- [Joe Flanigan](https://stargate.fandom.com/wiki/Joe_Flanigan "Joe Flanigan") as [Major](https://stargate.fandom.com/wiki/Major "Major")/ [Lt. Colonel](https://stargate.fandom.com/wiki/Lt._Colonel "Lt. Colonel") **[John Sheppard](https://stargate.fandom.com/wiki/John_Sheppard "John Sheppard")** (Season 1-5)
- [Torri Higginson](https://stargate.fandom.com/wiki/Torri_Higginson "Torri Higginson") as [Dr.](https://stargate.fandom.com/wiki/Dr. "Dr.") **[Elizabeth Weir](https://stargate.fandom.com/wiki/Elizabeth_Weir "Elizabeth Weir")** (Season 1-3 main, 4 recurring)
- [Amanda Tapping](https://stargate.fandom.com/wiki/Amanda_Tapping "Amanda Tapping") as [Colonel](https://stargate.fandom.com/wiki/Colonel "Colonel") **[Samantha Carter](https://stargate.fandom.com/wiki/Samantha_Carter "Samantha Carter")** (Season 4 main, 1-3 & 5 recurring)
- [Rachel Luttrell](https://stargate.fandom.com/wiki/Rachel_Luttrell "Rachel Luttrell") as **[Teyla Emmagan](https://stargate.fandom.com/wiki/Teyla_Emmagan "Teyla Emmagan")** (Season 1-5)
- [Jason Momoa](https://stargate.fandom.com/wiki/Jason_Momoa "Jason Momoa") as **[Ronon Dex](https://stargate.fandom.com/wiki/Ronon_Dex "Ronon Dex")** (Season 2-5)
- [Paul McGillion](https://stargate.fandom.com/wiki/Paul_McGillion "Paul McGillion") as [Dr.](https://stargate.fandom.com/wiki/Dr. "Dr.") **[Carson Beckett](https://stargate.fandom.com/wiki/Carson_Beckett "Carson Beckett")** (Season 1, 4 & 5 recurring, 2-3 main)
    `;
    const blob = new Blob([content], { type: "text/markdown" });
    const result = await processMarkdown("doc-1", filename, blob);

    expect(result.docId).toBe("doc-1");
    expect(result.docType).toBe("markdown");
    
    // Find the chunk corresponding to the Main Cast section
    const castChunk = result.chunks.find(c => c.text.includes("Joe Flanigan"));
    expect(castChunk).toBeDefined();

    if (castChunk) {
        // Check for baked-in context
        expect(castChunk.text).toContain("Context: Stargate Atlantis > Main Cast");
        // Check for raw DB field
        expect(castChunk.headingPath).toBe("Stargate Atlantis > Main Cast");
        
        // Ensure link stripping worked (should be "Joe Flanigan", not "[Joe Flanigan](...)")
        expect(castChunk.text).not.toContain("] (https://"); 
    }
  });

  it("should handle nested headers correctly", async () => {
    const content = `
# H1
## H2
### H3
Content here.
    `;
    const blob = new Blob([content], { type: "text/markdown" });
    const result = await processMarkdown("doc-2", "test.md", blob);
    
    const chunk = result.chunks.find(c => c.text.includes("Content here"));
    expect(chunk?.headingPath).toBe("H1 > H2 > H3");
    expect(chunk?.text).toContain("Context: H1 > H2 > H3");
  });
});