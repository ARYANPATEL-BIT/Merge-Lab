// /workspaces/:id - manage one workspace: members, pending join requests
// (approve/deny), the join code, tokens (mint/revoke), and a "Connect your IDE"
// panel with the exact mergelab init command plus the Claude and Cursor hook
// snippets. Same tokens and borders as the landing page; no new palette.

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import type { WorkspaceDetailResponse } from "@mergelab/shared";
import { ArrowRight, PillNav } from "../landing/Nav.js";
import { ThemeToggle } from "../landing/theme.js";
import { useDocumentTitle } from "../landing/motion.js";
import {
  apiUrl,
  approveRequest,
  denyRequest,
  getWorkspaceToken,
  getWorkspaceDetail,
  isDemo,
  mintWorkspaceToken,
  revokeWorkspaceToken,
} from "../data.js";
import { CopyButton, Notice, panel, tokenBox } from "./ui.js";

const API_BASE = apiUrl || "https://<your-api>.execute-api.ap-south-1.amazonaws.com";

function claudeSettings(): string {
  return JSON.stringify(
    {
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: "mergelab hook session-start" }] }],
        PreToolUse: [
          { matcher: "Write", hooks: [{ type: "command", command: "mergelab hook pre-write" }] },
        ],
      },
    },
    null,
    2,
  );
}

function cursorHooks(): string {
  return JSON.stringify(
    {
      version: 1,
      hooks: {
        beforeSubmitPrompt: [{ command: "mergelab hook session-start" }],
        afterFileEdit: [{ command: "mergelab hook pre-write" }],
      },
    },
    null,
    2,
  );
}

export function WorkspaceDetail() {
  const { id = "" } = useParams();
  useDocumentTitle("Workspace - Merge Lab");
  const [detail, setDetail] = useState<WorkspaceDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Plaintext tokens are only knowable at mint/approve time; surface them once.
  const [issued, setIssued] = useState<{ label: string; token: string }[]>([]);

  const refresh = useCallback(async () => {
    try {
      setDetail(await getWorkspaceDetail(id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const onApprove = (userId: string) =>
    run(async () => {
      const res = await approveRequest(id, userId);
      setIssued((prev) => [...prev, { label: res.summary.label, token: res.token }]);
      await refresh();
    });

  const onDeny = (userId: string) =>
    run(async () => {
      await denyRequest(id, userId);
      await refresh();
    });

  const onRevoke = (hash: string) =>
    run(async () => {
      await revokeWorkspaceToken(id, hash);
      await refresh();
    });

  // The token to show in the init command: the last one issued this session, or
  // the token already authorizing this page, or a placeholder to mint one.
  const connectToken = issued[issued.length - 1]?.token || getWorkspaceToken() || "<your-workspace-token>";
  const initCmd = `mergelab init --api-url "${API_BASE}" --token "${connectToken}"`;

  return (
    <div className="auth" style={{ minHeight: "100vh" }}>
      <PillNav>
        <Link
          to="/workspaces"
          style={{ color: "var(--fg-muted)", textDecoration: "none", fontSize: "0.85rem", fontWeight: 500 }}
        >
          ← Workspaces
        </Link>
        <span className={`mode-chip ${isDemo ? "mode-demo" : "mode-live"}`}>
          <span className="mode-dot" aria-hidden={true} />
          {isDemo ? "Demo" : "Live"}
        </span>
        <ThemeToggle />
      </PillNav>

      <main className="auth-main" style={{ alignItems: "flex-start", paddingTop: "6rem" }}>
        <div style={{ width: "min(760px, 92vw)", display: "grid", gap: "1.5rem" }}>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {!detail ? (
            <p style={{ color: "var(--fg-muted)" }}>Loading…</p>
          ) : (
            <>
              <header>
                <p className="label">Workspace</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                  <h1 className="auth-title" style={{ margin: 0 }}>
                    {detail.workspace.name}
                  </h1>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <Link
                      to={`/workspaces/${encodeURIComponent(id)}/connect`}
                      className="btn btn-secondary"
                      style={{ ...smallBtn, textDecoration: "none" }}
                    >
                      Connect instructions
                    </Link>
                    <Link
                      to={`/workspaces/${encodeURIComponent(id)}/board`}
                      className="mono"
                      style={{ color: "var(--accent)", textDecoration: "none", fontSize: "0.9rem" }}
                    >
                      Open board →
                    </Link>
                  </div>
                </div>
              </header>

              {/* Join code */}
              <section style={panel()}>
                <p className="label">Join code</p>
                <p style={{ fontSize: "var(--fs-small)", color: "var(--fg-muted)", marginTop: 0 }}>
                  Anyone with this code can request to join. You approve each request.
                </p>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span className="mono" style={{ ...tokenBox(), fontSize: "1rem", letterSpacing: "0.05em" }}>
                    {detail.workspace.join_code || "-"}
                  </span>
                  {detail.workspace.join_code ? <CopyButton value={detail.workspace.join_code} /> : null}
                </div>
              </section>

              {/* Members */}
              <section style={panel()}>
                <p className="label">Members ({detail.members.length})</p>
                <ul style={listReset}>
                  {detail.members.map((m) => (
                    <li key={m.user_id} style={rowStyle}>
                      <span style={{ fontWeight: 500 }}>{m.display_name}</span>
                      <span className="mono" style={{ fontSize: "var(--fs-small)", color: "var(--fg-muted)" }}>
                        {m.role}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Pending requests */}
              <section style={panel()}>
                <p className="label">Pending join requests ({detail.pending_requests.length})</p>
                {detail.pending_requests.length === 0 ? (
                  <p style={{ color: "var(--fg-muted)", margin: 0, fontSize: "var(--fs-small)" }}>
                    No requests waiting.
                  </p>
                ) : (
                  <ul style={listReset}>
                    {detail.pending_requests.map((r) => (
                      <li key={r.user_id} style={rowStyle}>
                        <span style={{ fontWeight: 500 }}>{r.display_name}</span>
                        <span style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busy}
                            onClick={() => onApprove(r.user_id)}
                            style={smallBtn}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={busy}
                            onClick={() => onDeny(r.user_id)}
                            style={smallBtn}
                          >
                            Deny
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Tokens issued this session (plaintext, shown once) */}
              {issued.length > 0 ? (
                <section style={panel()}>
                  <p className="label">New tokens - copy them now</p>
                  <Notice tone="success">
                    These are shown once. Hand each to its owner to run{" "}
                    <span className="mono">mergelab init</span>.
                  </Notice>
                  <ul style={{ ...listReset, marginTop: "0.75rem" }}>
                    {issued.map((t) => (
                      <li key={t.token} style={{ display: "grid", gap: "0.35rem", padding: "0.5rem 0" }}>
                        <span style={{ fontSize: "var(--fs-small)", color: "var(--fg-muted)" }}>{t.label}</span>
                        <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <span className="mono" style={{ ...tokenBox(), wordBreak: "break-all" }}>{t.token}</span>
                          <CopyButton value={t.token} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* Tokens */}
              <section style={panel()}>
                <p className="label">Tokens ({detail.tokens.length})</p>
                <MintToken
                  disabled={busy}
                  onMint={(label) =>
                    run(async () => {
                      const res = await mintWorkspaceToken(id, label);
                      setIssued((prev) => [...prev, { label: res.summary.label, token: res.token }]);
                      await refresh();
                    })
                  }
                />
                <ul style={{ ...listReset, marginTop: "0.75rem" }}>
                  {detail.tokens.map((t) => (
                    <li key={t.hash} style={rowStyle}>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 500 }}>{t.label}</span>{" "}
                        <span className="mono" style={{ fontSize: "var(--fs-micro)", color: "var(--fg-subtle)" }}>
                          {t.hash.slice(0, 10)}…
                        </span>
                        {t.revoked ? (
                          <span style={{ marginLeft: "0.5rem", fontSize: "var(--fs-micro)", color: "var(--sev-block)" }}>
                            revoked
                          </span>
                        ) : null}
                      </span>
                      {!t.revoked ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={busy}
                          onClick={() => onRevoke(t.hash)}
                          style={smallBtn}
                        >
                          Revoke
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>

              {/* Connect your IDE */}
              <section style={panel()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p className="label" style={{ margin: 0 }}>Connect your IDE</p>
                  <Link
                    to={`/workspaces/${encodeURIComponent(id)}/connect`}
                    style={{ fontSize: "0.8rem", color: "var(--accent)", textDecoration: "none" }}
                  >
                    Guided setup page →
                  </Link>
                </div>
                <p style={{ fontSize: "var(--fs-small)", color: "var(--fg-muted)", marginTop: "0.5rem" }}>
                  Point the CLI at this workspace, then wire the hooks into your agent.
                </p>
                <Snippet title="1. Initialize the CLI" value={initCmd} />
                <Snippet title="2. .claude/settings.json" value={claudeSettings()} />
                <Snippet title="3. .cursor/hooks.json" value={cursorHooks()} />
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function MintToken({ onMint, disabled }: { onMint: (label: string) => void; disabled: boolean }) {
  const [label, setLabel] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    onMint(label.trim());
    setLabel("");
  };
  return (
    <form onSubmit={submit} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
      <input
        aria-label="Token label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="e.g. CI runner"
        disabled={disabled}
        style={{
          flex: 1,
          padding: "0.4rem 0.6rem",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          background: "var(--bg)",
          color: "var(--fg)",
          fontSize: "0.85rem",
        }}
      />
      <button type="submit" className="btn btn-primary" disabled={disabled} style={smallBtn}>
        Mint token
        <ArrowRight />
      </button>
    </form>
  );
}

function Snippet({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ marginTop: "0.9rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
        <span className="label" style={{ margin: 0 }}>{title}</span>
        <CopyButton value={value} />
      </div>
      <pre
        className="mono"
        style={{
          margin: 0,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          padding: "0.6rem 0.75rem",
          fontSize: "0.78rem",
          overflowX: "auto",
          whiteSpace: "pre",
        }}
      >
        {value}
      </pre>
    </div>
  );
}

const listReset: CSSProperties = { listStyle: "none", margin: 0, padding: 0 };
const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  padding: "0.55rem 0",
  borderBottom: "1px solid var(--border)",
};
const smallBtn: CSSProperties = { fontSize: "0.78rem", padding: "0.3rem 0.7rem", minHeight: "auto" };
