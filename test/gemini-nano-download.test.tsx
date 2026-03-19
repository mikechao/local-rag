// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const doesBrowserSupportBrowserAIMock = vi.fn();
const browserAIMock = vi.fn();

vi.mock("@browser-ai/core", () => ({
  browserAI: browserAIMock,
  doesBrowserSupportBrowserAI: doesBrowserSupportBrowserAIMock,
}));

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("GeminiNanoDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    doesBrowserSupportBrowserAIMock.mockReturnValue(true);
  });

  it("shows a download action when Browser AI reports available-after-download", async () => {
    const model = {
      availability: vi.fn().mockResolvedValue("available-after-download"),
      createSessionWithProgress: vi.fn(),
    };
    browserAIMock.mockReturnValue(model);

    const { GeminiNanoDownload } = await import(
      "../src/components/model-download/GeminiNanoDownload"
    );

    render(<GeminiNanoDownload />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Download model" }),
      ).toBeTruthy();
    });

    expect(screen.queryByText("Unavailable")).toBeNull();
    expect(screen.queryByText("Ready")).toBeNull();
  });

  it("reports progress and ends in ready state after createSessionWithProgress", async () => {
    const deferred = createDeferred();
    const model = {
      availability: vi.fn().mockResolvedValue("available-after-download"),
      createSessionWithProgress: vi.fn(async (onProgress?: (p: number) => void) => {
        onProgress?.(0.25);
        await deferred.promise;
        return model;
      }),
    };
    browserAIMock.mockReturnValue(model);

    const { GeminiNanoDownload } = await import(
      "../src/components/model-download/GeminiNanoDownload"
    );

    render(<GeminiNanoDownload />);

    const button = await screen.findByRole("button", { name: "Download model" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("25%")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Downloading..." })).toBeTruthy();
    });

    deferred.resolve();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ready" })).toBeTruthy();
    });
  });
});
