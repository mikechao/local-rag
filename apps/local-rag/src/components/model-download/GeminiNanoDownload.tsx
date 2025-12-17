import { useCallback, useEffect, useState } from "react";
import { builtInAI, doesBrowserSupportBuiltInAI } from "@built-in-ai/core";
import { ExternalLink } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "../ui/button";

type Status =
  | "checking"
  | "unsupported"
  | "unavailable"
  | "idle"
  | "downloading"
  | "ready"
  | "error";

export function GeminiNanoDownload() {
  const [status, setStatus] = useState<Status>("checking");
  const [progress, setProgress] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!doesBrowserSupportBuiltInAI()) {
      setStatus("unsupported");
      return;
    }
    try {
      const model = builtInAI();
      const avail = await model.availability();
      if (avail === "available") setStatus("ready");
      else if (avail === "downloadable") setStatus("idle");
      else if (avail === "downloading") setStatus("downloading");
      else setStatus("unavailable");
    } catch (err) {
      setErrorMessage(String(err));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!isClient) return;
    void refreshStatus();
  }, [isClient, refreshStatus]);

  const startDownload = useCallback(async () => {
    if (
      status === "downloading" ||
      status === "ready" ||
      status === "unavailable"
    )
      return;
    setStatus("downloading");
    setProgress(0);
    setErrorMessage(null);

    try {
      const model = builtInAI();
      await model.createSessionWithProgress((p) => {
        setProgress(p);
      });
      setStatus("ready");
    } catch (err) {
      setErrorMessage(String(err));
      setStatus("error");
    }
  }, [status]);

  const buttonLabel = (() => {
    if (status === "checking") return "Checking...";
    if (status === "unsupported") return "Not supported";
    if (status === "unavailable") return "Unavailable";
    if (status === "downloading") return "Downloading...";
    if (status === "ready") return "Ready";
    if (status === "error") return "Retry download";
    return "Download model";
  })();

  const disableButton =
    status === "checking" ||
    status === "unsupported" ||
    status === "unavailable" ||
    status === "downloading" ||
    status === "ready";

  const percent = progress != null ? Math.round(progress * 100) : null;

  const showStatusMessage =
    status === "unsupported" ||
    status === "unavailable" ||
    (status === "error" && errorMessage);

  return (
    <Card className="w-full gap-0">
      <CardHeader className="border-b border-border">
        <div className="flex flex-col gap-2">
          <CardTitle className="text-2xl">Gemini Nano</CardTitle>
          <CardDescription className="text-foreground/80">
            Download{" "}
            <code className="inline-block bg-background border border-border px-1.5 py-0.5 rounded-base">
              Gemini Nano
            </code>{" "}
            built-in to Chrome. A multimodal model that can handle text, images,
            and audio inputs.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <a
              href="https://developer.chrome.com/docs/extensions/ai/prompt-api"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-main underline underline-offset-4"
            >
              Chrome Built-in AI Docs{" "}
              <ExternalLink size={16} strokeWidth={1.75} />
            </a>
          </div>
        </div>
      </CardHeader>

      {showStatusMessage && (
        <CardContent className="flex flex-col gap-3 py-4">
          {status === "unsupported" && (
            <div className="rounded-base border-2 border-border bg-background px-3 py-2 text-sm">
              <p className="mb-2">
                Built-in AI is not supported or enabled in this browser.
              </p>
              <p>
                Please enable the flag:{" "}
                <code className="bg-muted px-1 py-0.5 rounded-base">
                  chrome://flags/#prompt-api-for-gemini-nano-multimodal-input
                </code>
              </p>
            </div>
          )}

          {status === "unavailable" && (
            <div className="rounded-base border-2 border-border bg-background px-3 py-2 text-sm">
              Model not available to download in this environment.
            </div>
          )}

          {status === "error" && errorMessage && (
            <div className="rounded-base border-2 border-border bg-background px-3 py-2 text-sm">
              {errorMessage}
            </div>
          )}
        </CardContent>
      )}

      <CardFooter className="flex w-full flex-col items-start gap-3 border-t border-border py-4">
        <div className="flex w-full flex-wrap items-center gap-3">
          <Button onClick={startDownload} disabled={disableButton}>
            {buttonLabel}
          </Button>
        </div>

        {(status === "downloading" || percent !== null) && (
          <div className="w-full space-y-1">
            <div className="flex items-center justify-between text-sm text-foreground">
              <span>
                {status === "downloading"
                  ? "Downloading model..."
                  : "Download complete"}
              </span>
              {percent !== null && <span>{percent}%</span>}
            </div>
            <Progress value={percent ?? 100} />
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
