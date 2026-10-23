import { useEffect, useState } from "react";
import { useStore } from "@/lib/mock/store";

export type LoadStatus = "loading" | "error" | "ready";

// First visit to a page shows the loading state briefly; later visits are instant.
// "Simulate load errors" in the demo tools forces the error state.
const visited = new Set<string>();
const LOAD_MS = 350;

export function usePageLoad(key: string) {
  const { simulateError } = useStore();
  const [status, setStatus] = useState<LoadStatus>(() =>
    visited.has(key) && !simulateError ? "ready" : "loading",
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (status === "ready" && !simulateError) return;
    const timer = setTimeout(() => {
      if (simulateError) setStatus("error");
      else {
        visited.add(key);
        setStatus("ready");
      }
    }, LOAD_MS);
    return () => clearTimeout(timer);
    // status is intentionally not a dependency: it is the output of this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, simulateError, attempt]);

  const retry = () => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  };
  return { status, retry };
}
