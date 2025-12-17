import * as React from "react";
import { ensureDbReady } from "@/lib/db";

type ReadyStatus = "loading" | "ready" | "error";

export function useDbReady() {
  const [status, setStatus] = React.useState<ReadyStatus>("loading");
  const [error, setError] = React.useState<unknown>(null);

  React.useEffect(() => {
    let cancelled = false;

    ensureDbReady()
      .then(() => {
        if (!cancelled) {
          setStatus("ready");
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus("error");
          setError(err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { status, error };
}

export function useDbReadySuspense() {
  const promise = React.useMemo(() => ensureDbReady(), []);
  // React 19's use() will suspend until the promise settles.
  React.use(promise);
  return { status: "ready" as const };
}
