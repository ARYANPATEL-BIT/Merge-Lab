import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { fetchBoard, getStoredSession, isDemo, repo, type BoardSnapshot } from "./data.js";
import { relativeTime } from "./lib/format.js";
import { useDocumentTitle } from "./landing/motion.js";
import { PillNav } from "./landing/Nav.js";
import { ThemeToggle } from "./landing/theme.js";
import { Branches } from "./components/Branches.js";
import { Contracts } from "./components/Contracts.js";
import { DriftFeed } from "./components/DriftFeed.js";

const POLL_MS = 3000;

type Status = "loading" | "ok" | "error";

function useBoard(workspaceId?: string, repoName?: string) {
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
        const snap = await fetchBoard({
          workspaceId,
          repo: repoName,
          signal: controller.signal,
        });
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
  }, [workspaceId, repoName]);

  return { snapshot, status, error, updatedMs };
}

export function App() {
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const session = getStoredSession();
  const workspaceId =
    id ||
    searchParams.get("workspace") ||
    (window.location.pathname.startsWith("/workspaces/") ? id : session?.workspace);

  const [selectedRepo, setSelectedRepo] = useState<string | undefined>(undefined);
  const { snapshot, status, error, updatedMs } = useBoard(workspaceId, selectedRepo);

  useDocumentTitle("Merge Lab - Contract Board");

  // One-second ticker so the header freshness label counts up between polls.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Empty state 1: Workspace has no repos yet -> redirect to /workspaces/:id/connect
  useEffect(() => {
    if (
      workspaceId &&
      status === "ok" &&
      snapshot &&
      snapshot.repos &&
      snapshot.repos.length === 0
    ) {
      navigate(`/workspaces/${encodeURIComponent(workspaceId)}/connect`, { replace: true });
    }
  }, [workspaceId, status, snapshot, navigate]);

  const board = snapshot?.board;
  const nowMs = snapshot?.nowMs ?? Date.now();
  const repos = snapshot?.repos ?? (snapshot?.activeRepo ? [snapshot.activeRepo] : [repo]);
  const currentRepo = selectedRepo || snapshot?.activeRepo || repos[0] || repo;

  // Empty state 2: All branches dormant
  const allDormant = Boolean(
    board?.branches &&
      board.branches.length > 0 &&
      board.branches.every((b) => b.status === "dormant"),
  );

  // Empty state 3: Selected repo has 0 contracts
  let contractsEmptyTitle: string | undefined;
  let contractsEmptyHint: React.ReactNode | undefined;

  if (allDormant) {
    contractsEmptyTitle = "No active declarations";
    contractsEmptyHint = "All branches are currently dormant.";
  } else if (board && board.contracts.length === 0) {
    contractsEmptyTitle = `No contracts declared on any branch for ${currentRepo}.`;
    contractsEmptyHint = workspaceId ? (
      <Link
        to={`/workspaces/${encodeURIComponent(workspaceId)}/connect`}
        style={{ color: "var(--accent)" }}
      >
        View connect instructions →
      </Link>
    ) : undefined;
  }

  return (
    <div className="app">
      <PillNav>
        <Link
          to="/"
          style={{
            color: "var(--text-dim)",
            textDecoration: "none",
            fontSize: "0.85rem",
            padding: "0.2rem 0.4rem",
            fontWeight: 500,
          }}
        >
          Home
        </Link>
        {workspaceId ? (
          <Link
            to={`/workspaces/${encodeURIComponent(workspaceId)}`}
            style={{
              color: "var(--text-dim)",
              textDecoration: "none",
              fontSize: "0.85rem",
              padding: "0.2rem 0.4rem",
              fontWeight: 500,
            }}
          >
            Workspace
          </Link>
        ) : null}
        {repos.length > 1 ? (
          <select
            className="repo mono"
            aria-label="Select repository"
            value={currentRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
            style={{
              background: "var(--surface)",
              color: "var(--fg)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "0.2rem 0.5rem",
              fontSize: "0.85rem",
              fontFamily: "var(--font-mono, monospace)",
              cursor: "pointer",
            }}
          >
            {repos.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        ) : (
          <span className="repo mono" title="repository">
            {repos[0] || workspaceId || repo}
          </span>
        )}
        <span className={`mode-chip ${isDemo ? "mode-demo" : "mode-live"}`}>
          <span className="mode-dot" aria-hidden={true} />
          {isDemo ? "Demo" : "Live"}
        </span>
        {session ? (
          <span className="mono" style={{ fontSize: "0.8rem", color: "var(--text-dim)", padding: "0 0.25rem" }}>
            {session.user.name} ({session.workspace})
          </span>
        ) : (
          <Link
            to="/login"
            className="btn btn-secondary"
            style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", minHeight: "auto" }}
          >
            Log in
          </Link>
        )}
        {workspaceId ? (
          <Link
            to={`/workspaces/${encodeURIComponent(workspaceId)}/connect`}
            className="btn btn-secondary"
            style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", minHeight: "auto", textDecoration: "none" }}
          >
            Connect
          </Link>
        ) : null}
        <span className="freshness" role="status" aria-live="polite">
          {status === "loading"
            ? "connecting…"
            : updatedMs
              ? `updated ${relativeTime(new Date(updatedMs).toISOString(), Date.now())}`
              : "-"}
        </span>
        <ThemeToggle />
      </PillNav>

      {status === "error" ? (
        <div className="banner" role="status" aria-live="polite">
          Can't reach the registry{error ? ` (${error})` : ""}. Showing the last
          known snapshot - retrying every {POLL_MS / 1000}s.
        </div>
      ) : null}

      {board ? (
        <main className="grid">
          <div className="col col-left">
            <Branches branches={board.branches} nowMs={nowMs} />
            <Contracts
              contracts={board.contracts}
              emptyTitle={contractsEmptyTitle}
              emptyHint={contractsEmptyHint}
            />
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
