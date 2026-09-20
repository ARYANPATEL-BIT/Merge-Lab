// /workspaces/:id/connect - Onboarding and setup page for connecting a repository
// and IDE agents to a workspace. Live polls for the first declaration and flips
// to the board when received.

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { WorkspaceDetailResponse } from "@mergelab/shared";
import { PillNav } from "../landing/Nav.js";
import { ThemeToggle } from "../landing/theme.js";
import { useDocumentTitle } from "../landing/motion.js";
import {
  apiUrl,
  demoPublishToWorkspace,
  fetchBoard,
  getStoredSession,
  getWorkspaceDetail,
  isDemo,
} from "../data.js";
import { CopyButton, panel, tokenBox } from "./ui.js";

const CLAUDE_CODE_CONFIG = JSON.stringify(
  {
    hooks: {
      SessionStart: [
        {
          hooks: [
            { type: "command", command: "mergelab hook session-start" },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: "Edit|Write|MultiEdit",
          hooks: [
            { type: "command", command: "mergelab hook pre-write" },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: "Edit|Write|MultiEdit",
          hooks: [
            { type: "command", command: "mergelab publish" },
          ],
        },
      ],
    },
  },
  null,
  2,
);

const CURSOR_CONFIG = JSON.stringify(
  {
    version: 1,
    hooks: {
      sessionStart: [{ command: "mergelab hook session-start" }],
      preToolUse: [{ command: "mergelab hook pre-write" }],
      afterFileEdit: [{ command: "mergelab publish" }],
    },
  },
  null,
  2,
);

function maskToken(token: string): string {
  if (!token) return "••••••••••••••••";
  if (token.length <= 10) return "••••••••";
  return `${token.slice(0, 6)}••••••••••••••••${token.slice(-4)}`;
}

interface ReceivedMeta {
  repo: string;
  branch: string;
  owner: string;
  symbolCount: number;
}

export function ConnectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useDocumentTitle("Connect Workspace - Merge Lab");

  const [detail, setDetail] = useState<WorkspaceDetailResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"claude" | "cursor">("claude");
  const [revealToken, setRevealToken] = useState(false);
  const [received, setReceived] = useState<ReceivedMeta | null>(null);

  const session = getStoredSession();
  const workspaceId = id || session?.workspace || "default";

  // Load workspace detail to grab the real token
  useEffect(() => {
    if (!id) return;
    void getWorkspaceDetail(id).then(setDetail).catch(() => {});
  }, [id]);

  const activeToken =
    session?.token ||
    (detail?.tokens && detail.tokens.length > 0 ? detail.tokens[0].hash : "") ||
    "ml_ws_token";

  const effectiveApiUrl =
    apiUrl ||
    (typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://api.mergelab.dev");

  const initCommandReal = `mergelab init --api-url "${effectiveApiUrl}" --token "${activeToken}"`;
  const initCommandDisplay = `mergelab init --api-url "${effectiveApiUrl}" --token "${
    revealToken ? activeToken : maskToken(activeToken)
  }"`;

  // Poll for first declaration
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const snap = await fetchBoard({ workspaceId });
        if (cancelled) return;
        if (snap.board && snap.board.contracts.length > 0) {
          const first = snap.board.contracts[0];
          setReceived({
            repo: first.repo,
            branch: first.branch,
            owner: first.owner,
            symbolCount: snap.board.contracts.length,
          });
          // After a short beat, auto-navigate to the board
          setTimeout(() => {
            navigate(`/workspaces/${encodeURIComponent(workspaceId)}/board`);
          }, 2000);
        }
      } catch {
        // Retry next poll
      }
    }

    void check();
    timerRef.current = window.setInterval(() => void check(), 3000);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [workspaceId, navigate]);

  // Demo simulator helper
  const simulatePublish = () => {
    demoPublishToWorkspace(
      workspaceId,
      "acme/core",
      "main",
      session?.user?.name || "you",
      [
        {
          kind: "function",
          symbol: "authenticateUser",
          signature: "authenticateUser(token: string) -> Promise<User>",
          shape: { user_id: "string", email: "string" },
        },
        {
          kind: "type",
          symbol: "UserSession",
          shape: { session_id: "string", expires_at: "string" },
        },
      ],
    );
  };

  return (
    <div className="auth" style={{ minHeight: "100vh", paddingBottom: "4rem" }}>
      <PillNav>
        <Link
          to="/"
          style={{
            color: "var(--fg-muted)",
            textDecoration: "none",
            fontSize: "0.85rem",
            fontWeight: 500,
          }}
        >
          Home
        </Link>
        <Link
          to="/workspaces"
          style={{
            color: "var(--fg-muted)",
            textDecoration: "none",
            fontSize: "0.85rem",
            fontWeight: 500,
          }}
        >
          Workspaces
        </Link>
        <span className={`mode-chip ${isDemo ? "mode-demo" : "mode-live"}`}>
          <span className="mode-dot" aria-hidden={true} />
          {isDemo ? "Demo" : "Live"}
        </span>
        <ThemeToggle />
      </PillNav>

      <main className="auth-main" style={{ alignItems: "flex-start", paddingTop: "5.5rem" }}>
        <div style={{ width: "min(760px, 92vw)", display: "grid", gap: "1.5rem" }}>
          <header>
            <p className="label">Workspace Setup</p>
            <h1 className="auth-title" style={{ marginBottom: "0.5rem" }}>
              Connect your codebase
            </h1>
            <div
              style={{
                border: "1px solid var(--border)",
                background: "var(--surface)",
                borderRadius: "var(--radius-sm)",
                padding: "0.75rem 1rem",
                color: "var(--fg)",
                fontSize: "0.95rem",
                lineHeight: 1.5,
              }}
            >
              A repository appears here when someone on your team runs{" "}
              <code className="mono" style={{ color: "var(--accent)" }}>
                mergelab publish
              </code>{" "}
              from it. Merge Lab reads the working tree on your machine, including
              uncommitted work - not GitHub.
            </div>
          </header>

          {/* 1. Install */}
          <section style={panel()}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "1.5rem",
                  height: "1.5rem",
                  borderRadius: "50%",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                }}
              >
                1
              </span>
              <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>
                Install the CLI
              </h2>
            </div>
            <p style={{ fontSize: "var(--fs-small)", color: "var(--fg-muted)", margin: "0 0 0.5rem" }}>
              Install the daemon and hook runner globally on your machine:
            </p>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span style={tokenBox()}>npm i -g @mergelab/daemon</span>
              <CopyButton value="npm i -g @mergelab/daemon" />
            </div>
          </section>

          {/* 2. Connect workspace */}
          <section style={panel()}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "1.5rem",
                  height: "1.5rem",
                  borderRadius: "50%",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                }}
              >
                2
              </span>
              <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>
                Connect this workspace
              </h2>
            </div>
            <p style={{ fontSize: "var(--fs-small)", color: "var(--fg-muted)", margin: "0 0 0.5rem" }}>
              Initialize Merge Lab in your project repository directory:
            </p>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <span style={tokenBox()}>{initCommandDisplay}</span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setRevealToken((r) => !r)}
                style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem", minHeight: "auto" }}
              >
                {revealToken ? "Hide token" : "Reveal token"}
              </button>
              <CopyButton value={initCommandReal} />
            </div>
          </section>

          {/* 3. Wire your agent */}
          <section style={panel()}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "1.5rem",
                  height: "1.5rem",
                  borderRadius: "50%",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                }}
              >
                3
              </span>
              <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>
                Wire your agent
              </h2>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <button
                type="button"
                className={`btn ${activeTab === "claude" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setActiveTab("claude")}
                style={{ fontSize: "0.8rem", padding: "0.3rem 0.75rem", minHeight: "auto" }}
              >
                Claude Code
              </button>
              <button
                type="button"
                className={`btn ${activeTab === "cursor" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setActiveTab("cursor")}
                style={{ fontSize: "0.8rem", padding: "0.3rem 0.75rem", minHeight: "auto" }}
              >
                Cursor
              </button>
            </div>

            {activeTab === "claude" ? (
              <div>
                <p style={{ fontSize: "var(--fs-small)", color: "var(--fg-muted)", margin: "0 0 0.5rem" }}>
                  Add to <span className="mono">.claude/settings.json</span>:
                </p>
                <div style={{ position: "relative" }}>
                  <pre
                    className="mono"
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.85rem",
                      fontSize: "0.8rem",
                      overflowX: "auto",
                      margin: 0,
                    }}
                  >
                    {CLAUDE_CODE_CONFIG}
                  </pre>
                  <div style={{ position: "absolute", top: "0.5rem", right: "0.5rem" }}>
                    <CopyButton value={CLAUDE_CODE_CONFIG} />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: "var(--fs-small)", color: "var(--fg-muted)", margin: "0 0 0.5rem" }}>
                  Add to <span className="mono">.cursor/hooks.json</span>:
                </p>
                <div style={{ position: "relative" }}>
                  <pre
                    className="mono"
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.85rem",
                      fontSize: "0.8rem",
                      overflowX: "auto",
                      margin: 0,
                    }}
                  >
                    {CURSOR_CONFIG}
                  </pre>
                  <div style={{ position: "absolute", top: "0.5rem", right: "0.5rem" }}>
                    <CopyButton value={CURSOR_CONFIG} />
                  </div>
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--fg-muted)", marginTop: "0.5rem", fontStyle: "italic" }}>
                  Note: sessionStart does not fire for cloud agents.
                </p>
              </div>
            )}
          </section>

          {/* Verify / Waiting / The Flip */}
          <section
            style={{
              ...panel(),
              border: received ? "1px solid var(--ok)" : "1px dashed var(--accent)",
              background: received ? "rgba(34, 197, 94, 0.05)" : "var(--surface)",
              transition: "all 0.3s ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <p className="label" style={{ marginBottom: "0.25rem" }}>
                  Verify
                </p>
                <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontWeight: 600 }}>
                  Run your first publish
                </h3>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span style={tokenBox()}>mergelab publish</span>
                  <CopyButton value="mergelab publish" />
                </div>
              </div>

              {/* The Flip */}
              {received ? (
                <div
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--ok)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.75rem 1rem",
                    display: "grid",
                    gap: "0.25rem",
                  }}
                >
                  <div style={{ color: "var(--ok)", fontWeight: 600, fontSize: "0.9rem" }}>
                    Declaration received! Redirecting to board…
                  </div>
                  <div className="mono" style={{ fontSize: "0.8rem", color: "var(--fg)" }}>
                    {received.repo} · {received.branch} ({received.owner})
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--fg-muted)" }}>
                    {received.symbolCount} symbol{received.symbolCount === 1 ? "" : "s"} extracted
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "var(--accent)",
                      animation: "pulse 1.5s infinite",
                    }}
                  />
                  <span style={{ fontSize: "0.85rem", color: "var(--fg-muted)" }}>
                    Waiting for your first declaration…
                  </span>
                  {isDemo ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={simulatePublish}
                      style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", minHeight: "auto" }}
                      title="Simulate a terminal mergelab publish in demo mode"
                    >
                      Simulate publish
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </section>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Link
              to={`/workspaces/${encodeURIComponent(workspaceId)}`}
              style={{ fontSize: "0.85rem", color: "var(--fg-muted)", textDecoration: "none" }}
            >
              Back to workspace details
            </Link>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate(`/workspaces/${encodeURIComponent(workspaceId)}/board`)}
              style={{ fontSize: "0.8rem" }}
            >
              Skip to board
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
