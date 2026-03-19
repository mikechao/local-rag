import { beforeEach, describe, expect, it, vi } from "vitest";

const embeddingMock = vi.fn();
const transcriptionMock = vi.fn();
const doesBrowserSupportTransformersJSMock = vi.fn();

vi.mock("@browser-ai/transformers-js", () => ({
  transformersJS: {
    embedding: embeddingMock,
    transcription: transcriptionMock,
  },
  doesBrowserSupportTransformersJS: doesBrowserSupportTransformersJSMock,
}));

describe("transformers provider migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    doesBrowserSupportTransformersJSMock.mockReturnValue(true);
  });

  it("getModel creates the embedding provider with the expected model id and device", async () => {
    const model = {
      availability: vi.fn(),
      createSessionWithProgress: vi.fn(),
    };
    embeddingMock.mockReturnValue(model);

    const embeddingModule = await import("../src/lib/models/embeddingModel");

    const result = embeddingModule.getModel();

    expect(result).toBe(model);
    expect(embeddingMock).toHaveBeenCalledWith(embeddingModule.MODEL_ID, {
      device: "webgpu",
    });
  });

  it("getWhisperModel creates the transcription provider from the published package", async () => {
    const model = {
      availability: vi.fn(),
      createSessionWithProgress: vi.fn(),
    };
    transcriptionMock.mockReturnValue(model);

    const whisperModule = await import("../src/lib/models/whisperModel");

    const result = whisperModule.getWhisperModel();

    expect(result).toBe(model);
    expect(transcriptionMock).toHaveBeenCalledWith(whisperModule.MODEL_ID);
  });

  it("ensureEmbeddingModelReady forwards numeric progress values from the published package", async () => {
    const progressValues: number[] = [];
    const model = {
      availability: vi.fn().mockResolvedValue("downloadable"),
      createSessionWithProgress: vi.fn(async (onProgress?: (progress: number) => void) => {
        onProgress?.(0.4);
        return model;
      }),
    };
    embeddingMock.mockReturnValue(model);

    const embeddingModule = await import("../src/lib/models/embeddingModel");

    await embeddingModule.ensureEmbeddingModelReady({
      onProgress: (progress) => progressValues.push(progress),
    });

    expect(progressValues).toEqual([0.4]);
    expect(model.createSessionWithProgress).toHaveBeenCalledTimes(1);
  });

  it('getModelDescriptor("whisper").warmup normalizes numeric transcription progress', async () => {
    const model = {
      availability: vi.fn().mockResolvedValue("downloadable"),
      createSessionWithProgress: vi.fn(async (onProgress?: (progress: number) => void) => {
        onProgress?.(0.5);
        return model;
      }),
    };
    transcriptionMock.mockReturnValue(model);

    const { getModelDescriptor } = await import("../src/lib/models/model-registry");

    const progressValues: number[] = [];
    await getModelDescriptor("whisper").warmup({
      onProgress: (progress) => progressValues.push(progress),
    });

    expect(progressValues).toEqual([0.5]);
    expect(model.createSessionWithProgress).toHaveBeenCalledTimes(1);
  });
});
