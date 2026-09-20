// /workspaces - list the workspaces this token can see, create a new one, or
// request to join one with a code and a display name. Uses the same tokens,
// type scale and borders as the landing page (no new palette).

import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { WorkspaceSummary } from "@mergelab/shared";
import { ArrowRight, PillNav } from "../landing/Nav.js";
import { ThemeToggle } from "../landing/theme.js";
import { useDocumentTitle } from "../landing/motion.js";
import {
  createWorkspace,
  isDemo,
  joinWorkspace,
  listWorkspaces,
} from "../data.js";
import { CopyButton, Notice, panel, tokenBox } from "./ui.js";

export function Workspaces() {
  useDocumentTitle("Workspaces - Merge Lab");
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  async function refresh() {
    try {
      setWorkspaces(await listWorkspaces());
      setListError(null);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="auth" style={{ minHeight: "100vh" }}>
      <PillNav>
        <Link
          to="/"
          style={{ color: "var(--fg-muted)", textDecoration: "none", fontSize: "0.85rem", fontWeight: 500 }}
        >
          Home
        </Link>
        <span className={`mode-chip ${isDemo ? "mode-demo" : "mode-live"}`}>
          <span className="mode-dot" aria-hidden={true} />
          {isDemo ? "Demo" : "Live"}
        </span>
        <ThemeToggle />
      </PillNav>

      <main className="auth-main" style={{ alignItems: "flex-start", paddingTop: "6rem" }}>
        <div style={{ width: "min(720px, 92vw)", display: "grid", gap: "1.5rem" }}>
          <header>
            <p className="label">Workspaces</p>
            <h1 className="auth-title" style={{ marginBottom: "0.25rem" }}>
              Your workspaces
            </h1>
            <p className="auth-sub" style={{ margin: 0 }}>
              A workspace groups the contracts your team publishes. Each has a join
              code and its own tokens.
            </p>
          </header>

          {listError ? <Notice tone="error">{listError}</Notice> : null}

          <section style={panel()}>
            {workspaces === null ? (
              <p style={{ color: "var(--fg-muted)", margin: 0 }}>Loading…</p>
            ) : workspaces.length === 0 ? (
              <p style={{ color: "var(--fg-muted)", margin: 0 }}>
                No workspaces yet. Create one below, or join a teammate's with a code.
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" }}>
                {workspaces.map((w) => (
                  <li
                    key={w.workspace_id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                      padding: "0.85rem 1rem",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{w.name}</div>
                      <div style={{ fontSize: "var(--fs-small)", color: "var(--fg-muted)" }}>
                        {w.member_count} member{w.member_count === 1 ? "" : "s"} · {w.repo_count} repo
                        {w.repo_count === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                      <Link
                        to={`/workspaces/${encodeURIComponent(w.workspace_id)}`}
                        className="btn btn-secondary"
                        style={{ fontSize: "0.8rem", padding: "0.3rem 0.7rem", minHeight: "auto" }}
                      >
                        Manage
                      </Link>
                      <Link
                        to="/board"
                        className="btn btn-primary"
                        style={{ fontSize: "0.8rem", padding: "0.3rem 0.7rem", minHeight: "auto" }}
                      >
                        Open board
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            <CreateWorkspace onCreated={refresh} />
            <JoinWorkspace />
          </div>
        </div>
      </main>
    </div>
  );
}

function CreateWorkspace({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ join_code: string; token: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name || !displayName) {
      setError("Enter a workspace name and your display name.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await createWorkspace({ name, display_name: displayName });
      setCreated({ join_code: res.workspace.join_code, token: res.token });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (created) {
    return (
      <section style={panel()}>
        <p className="label">Workspace created</p>
        <p style={{ fontSize: "var(--fs-small)", color: "var(--fg-muted)", marginTop: 0 }}>
          Share the join code so teammates can request access. Keep the owner token
          safe - it authorizes managing this workspace.
        </p>
        <div style={{ display: "grid", gap: "0.75rem" }}>
          <div>
            <p className="label" style={{ marginBottom: "0.25rem" }}>Join code</p>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span className="mono" style={tokenBox()}>{created.join_code}</span>
              <CopyButton value={created.join_code} />
            </div>
          </div>
          <div>
            <p className="label" style={{ marginBottom: "0.25rem" }}>Owner token</p>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span className="mono" style={{ ...tokenBox(), wordBreak: "break-all" }}>{created.token}</span>
              <CopyButton value={created.token} />
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section style={panel()}>
      <p className="label">Create a workspace</p>
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="ws-name">Workspace name</label>
          <input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Team" disabled={loading} />
        </div>
        <div className="field">
          <label htmlFor="ws-owner">Your display name</label>
          <input id="ws-owner" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ada" disabled={loading} />
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
          {loading ? "Creating…" : "Create workspace"}
          <ArrowRight />
        </button>
      </form>
    </section>
  );
}

function JoinWorkspace() {
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code || !displayName) {
      setError("Enter a join code and your display name.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await joinWorkspace({ join_code: code, display_name: displayName });
      setDone(res.workspace_name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <section style={panel()}>
        <p className="label">Request sent</p>
        <Notice tone="success">
          Asked to join <strong>{done}</strong>. An owner approves it and hands you a
          token to run <span className="mono">mergelab init</span>.
        </Notice>
      </section>
    );
  }

  return (
    <section style={panel()}>
      <p className="label">Join a workspace</p>
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="join-code">Join code</label>
          <input id="join-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ML-7K2QX" disabled={loading} />
        </div>
        <div className="field">
          <label htmlFor="join-name">Your display name</label>
          <input id="join-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Grace" disabled={loading} />
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
          {loading ? "Requesting…" : "Request to join"}
          <ArrowRight />
        </button>
      </form>
    </section>
  );
}
