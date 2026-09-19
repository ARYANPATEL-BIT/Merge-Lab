import { useEffect, useState } from "react";
import { fetchBoard, isDemo, repo, type BoardSnapshot } from "./data.js";
import { relativeTime } from "./lib/format.js";
import { useDocumentTitle } from "./landing/motion.js";
import { PillNav } from "./landing/Nav.js";
import { ThemeToggle } from "./landing/theme.js";
import { Branches } from "./components/Branches.js";
import { Contracts } from "./components/Contracts.js";
import { DriftFeed } from "./components/DriftFeed.js";

const POLL_MS = 3000;

type Status = "loading" | "ok" | "error";

function useBoard() {
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [updatedMs, setUpdatedMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;

    async function tick() {
      controller?.abort();
      controller = new AbortController();
      try {
        const snap = await fetchBoard(controller.signal);
        if (cancelled) return;
        setSnapshot(snap);
        setUpdatedMs(Date.now());
        setStatus("ok");
        setError(null);
      } catch (e) {
        if (cancelled || controller?.signal.aborted) return;
        // Keep the last good snapshot on screen; surface the error non-destructively.
        setStatus("error");
        setError(e instanceof Error ? e.message : String(e));
      }
    }

    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      controller?.abort();
      clearInterval(id);
    };
  }, []);

  return { snapshot, status, error, updatedMs };
}

export function App() {
  const { snapshot, status, error, updatedMs } = useBoard();

  useDocumentTitle("Merge Lab — Contract Board");

  // One-second ticker so the header freshness label counts up between polls.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const board = snapshot?.board;
  const nowMs = snapshot?.nowMs ?? Date.now();

  return (
    <div className="app">
      <PillNav>
        <span className="repo mono" title="repository">
          {repo}
        </span>
        <span className={`mode-chip ${isDemo ? "mode-demo" : "mode-live"}`}>
          <span className="mode-dot" aria-hidden={true} />
          {isDemo ? "Demo" : "Live"}
        </span>
        <span className="freshness" role="status" aria-live="polite">
          {status === "loading"
            ? "connecting…"
            : updatedMs
              ? `updated ${relativeTime(new Date(updatedMs).toISOString(), Date.now())}`
              : "—"}
        </span>
        <ThemeToggle />
      </PillNav>

      {status === "error" ? (
        <div className="banner" role="status" aria-live="polite">
          Can't reach the registry{error ? ` (${error})` : ""}. Showing the last
          known snapshot — retrying every {POLL_MS / 1000}s.
        </div>
      ) : null}

      {board ? (
        <main className="grid">
          <div className="col col-left">
            <Branches branches={board.branches} nowMs={nowMs} />
            <Contracts contracts={board.contracts} />
          </div>
          <div className="col col-right">
            <DriftFeed findings={board.findings} />
          </div>
        </main>
      ) : (
        <main className="grid grid-loading">
          <p className="loading-note">Connecting to the registry…</p>
        </main>
      )}
    </div>
  );
}
