import { PageContainer } from "@/components/PageContainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { useDbReady } from "@/hooks/use-db-ready";
import {
  DEFAULT_RERANK_MIN_SCORE,
  getRerankMinScore,
  setRerankMinScore,
} from "@/lib/settings";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

type SaveState = "idle" | "saving" | "saved" | "error";

function SettingsPage() {
  const { status, error } = useDbReady();
  const defaultPct = useMemo(
    () => Math.round(DEFAULT_RERANK_MIN_SCORE * 100),
    [],
  );
  const [rerankMinScorePct, setRerankMinScorePct] =
    useState<number>(defaultPct);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;
    void getRerankMinScore()
      .then((value) => {
        if (cancelled) return;
        setRerankMinScorePct(Math.round(value * 100));
        setSaveState("idle");
        setSaveError(null);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [status]);

  const rerankMinScore = rerankMinScorePct / 100;

  return (
    <PageContainer
      label="Settings"
      title="Application Settings"
      description="Configure application preferences and settings."
    >
      {status === "loading" && (
        <div className="text-sm text-muted-foreground">Loading settings…</div>
      )}
      {status === "error" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to initialize database. {String(error)}
        </div>
      )}
      {status === "ready" && (
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Rerank threshold</CardTitle>
              <p className="text-sm text-foreground/70">
                Filters retrieval sources after reranking. Only sources with a
                rerank score greater than or equal to this value are kept and
                passed into the LLM as context. Higher values reduce noise but
                may hide helpful context.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm">
                  Minimum rerank score:{" "}
                  <span className="font-semibold tabular-nums">
                    {rerankMinScore.toFixed(2)}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    saveState === "saving" || rerankMinScorePct === defaultPct
                  }
                  onClick={() => {
                    setRerankMinScorePct(defaultPct);
                    setSaveState("saving");
                    setSaveError(null);
                    void setRerankMinScore(DEFAULT_RERANK_MIN_SCORE)
                      .then(() => setSaveState("saved"))
                      .catch((err) => {
                        console.error(err);
                        setSaveState("error");
                        setSaveError(String(err));
                      });
                  }}
                >
                  Reset to default
                </Button>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[rerankMinScorePct]}
                onValueChange={(values) => {
                  const next = values[0];
                  if (typeof next === "number") setRerankMinScorePct(next);
                }}
                onValueCommit={(values) => {
                  const next = values[0];
                  if (typeof next !== "number") return;
                  setSaveState("saving");
                  setSaveError(null);
                  void setRerankMinScore(next / 100)
                    .then(() => setSaveState("saved"))
                    .catch((err) => {
                      console.error(err);
                      setSaveState("error");
                      setSaveError(String(err));
                    });
                }}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Range: 0.00–1.00. Default:{" "}
                  {DEFAULT_RERANK_MIN_SCORE.toFixed(2)}. Changes save
                  automatically when you release the slider.
                </span>
                <span aria-live="polite" className="tabular-nums">
                  {saveState === "saving" && "Saving…"}
                  {saveState === "saved" && "Saved"}
                  {saveState === "error" && "Save failed"}
                </span>
              </div>
              {saveState === "error" && saveError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  Failed to save setting. {saveError}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
