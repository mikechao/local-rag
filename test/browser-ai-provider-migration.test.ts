import { beforeEach, describe, expect, it, vi } from "vitest";

const browserAIMock = vi.fn();
const generateTextMock = vi.fn();

vi.mock("@browser-ai/core", () => ({
  browserAI: browserAIMock,
}));

vi.mock("ai", () => ({
  generateText: generateTextMock,
}));

describe("browser AI provider migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("generateChatTitle requests the text model from browserAI", async () => {
    const model = { kind: "browser-ai-model" };
    browserAIMock.mockReturnValue(model);
    generateTextMock.mockResolvedValue({ text: "Stargate Atlantis" });

    const { generateChatTitle } = await import("../src/lib/chat-title");

    const result = await generateChatTitle([
      {
        id: "1",
        role: "user",
        parts: [{ type: "text", text: "Tell me about Atlantis" }],
      } as any,
      {
        id: "2",
        role: "assistant",
        parts: [{ type: "text", text: "Atlantis was cancelled in 2009." }],
      } as any,
    ]);

    expect(result).toBe("Stargate Atlantis");
    expect(browserAIMock).toHaveBeenCalledWith("text");
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model,
      }),
    );
  });

  it("summarizeChat reuses a single browserAI text model across chunk summaries", async () => {
    const model = { kind: "browser-ai-model" };
    browserAIMock.mockReturnValue(model);
    generateTextMock
      .mockResolvedValueOnce({ text: "First summary" })
      .mockResolvedValueOnce({ text: "Second summary" });

    const { summarizeChat } = await import("../src/lib/chat-summarize");

    const result = await summarizeChat([
      {
        id: "1",
        role: "user",
        parts: [{ type: "text", text: "First half" }],
      } as any,
      {
        id: "2",
        role: "assistant",
        parts: [{ type: "text", text: "Still first half" }],
      } as any,
      {
        id: "3",
        role: "user",
        parts: [{ type: "text", text: "Second half" }],
      } as any,
      {
        id: "4",
        role: "assistant",
        parts: [{ type: "text", text: "Still second half" }],
      } as any,
    ]);

    expect(result).toBe("First summary\n\nSecond summary");
    expect(browserAIMock).toHaveBeenCalledTimes(1);
    expect(browserAIMock).toHaveBeenCalledWith("text", {
      expectedInputs: [{ type: "text" }],
    });
    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(generateTextMock.mock.calls[0][0].model).toBe(model);
    expect(generateTextMock.mock.calls[1][0].model).toBe(model);
  });
});
