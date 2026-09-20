// Real, functional Authentication screens for Merge Lab.
// Connects with DynamoDB in live cloud mode and falls back to local storage in demo mode.

import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, PillNav } from "./Nav.js";
import { ThemeToggle } from "./theme.js";
import { Cursor } from "./Cursor.js";
import { richMotionAllowed, useDocumentTitle } from "./motion.js";
import { apiLogin, apiSignup, getStoredSession, type UserSession } from "../data.js";

const RippleWater = lazy(() =>
  import("./RippleWater.js").then((m) => ({ default: m.RippleWater })),
);

function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const [rich, setRich] = useState(false);
  useEffect(() => setRich(richMotionAllowed()), []);

  return (
    <div className="auth">
      {rich ? <Cursor /> : null}
      <PillNav>
        <ThemeToggle />
        <Link className="btn btn-primary nav-cta" to="/board">
          Open the board
          <ArrowRight />
        </Link>
      </PillNav>

      <div className="auth-bg" aria-hidden={true}>
        {rich ? (
          <Suspense fallback={null}>
            <RippleWater />
          </Suspense>
        ) : null}
      </div>

      <main className="auth-main">
        <div className="auth-card">
          <p className="label">{eyebrow}</p>
          <h1 className="auth-title">{title}</h1>
          <p className="auth-sub">{subtitle}</p>
          {children}
          <div className="auth-footer">{footer}</div>
        </div>
      </main>
    </div>
  );
}

function TokenSuccessView({
  session,
  isNew,
}: {
  session: UserSession;
  isNew: boolean;
}) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const initCmd = `mergelab init --token "${session.token}" --owner "${session.user.name}"`;

  const copyCmd = () => {
    navigator.clipboard.writeText(initCmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="auth-success-view">
      <div className="auth-notice is-success" role="status">
        {isNew ? "Workspace registered successfully in DynamoDB!" : "Welcome back!"}
      </div>

      <div className="auth-token-box" style={{ marginTop: "1rem", marginBottom: "1.5rem" }}>
        <p className="label" style={{ marginBottom: "0.25rem" }}>
          Workspace: <strong>{session.workspace}</strong>
        </p>
        <p className="label" style={{ marginBottom: "0.5rem" }}>
          Your Bearer Token (MERGELAB_TOKEN):
        </p>
        <div
          className="mono"
          style={{
            background: "var(--bg-inset, rgba(0,0,0,0.06))",
            padding: "0.5rem 0.75rem",
            borderRadius: "6px",
            fontSize: "0.85rem",
            wordBreak: "break-all",
          }}
        >
          {session.token}
        </div>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <p className="label" style={{ marginBottom: "0.25rem" }}>
          Connect your local terminal CLI:
        </p>
        <div
          className="mono"
          style={{
            background: "var(--bg-inset, rgba(0,0,0,0.06))",
            padding: "0.5rem 0.75rem",
            borderRadius: "6px",
            fontSize: "0.8rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {initCmd}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={copyCmd}
            style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", minHeight: "auto" }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary auth-submit"
        onClick={() => navigate("/board")}
      >
        Proceed to Live Board
        <ArrowRight />
      </button>
    </div>
  );
}

export function Login() {
  useDocumentTitle("Log in - Merge Lab");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<UserSession | null>(() => getStoredSession());

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in both email and password.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await apiLogin({ email, password });
      setSession(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (session) {
    return (
      <AuthShell
        eyebrow="Authenticated"
        title="Session Active"
        subtitle={`Signed in as ${session.user.email}`}
        footer={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              localStorage.removeItem("mergelab_session");
              setSession(null);
            }}
            style={{ fontSize: "0.85rem", padding: "0.25rem 0.75rem" }}
          >
            Sign out
          </button>
        }
      >
        <TokenSuccessView session={session} isNew={false} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Log in"
      subtitle="Access your workspace contracts and live team drift."
      footer={
        <>
          New to Merge Lab? <Link to="/signup">Create an account</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@team.dev"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        {error ? (
          <p className="auth-notice" role="alert" style={{ color: "var(--color-block, #d32f2f)" }}>
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
          {loading ? "Authenticating..." : "Log in"}
          <ArrowRight />
        </button>
      </form>
    </AuthShell>
  );
}

export function Signup() {
  useDocumentTitle("Sign up - Merge Lab");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<UserSession | null>(() => getStoredSession());

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError("Please fill in your name, email, and password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await apiSignup({ name, email, password, workspace: workspace || undefined });
      setSession(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (session) {
    return (
      <AuthShell
        eyebrow="Workspace ready"
        title="Account Created"
        subtitle={`Connected to workspace ${session.workspace}`}
        footer={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              localStorage.removeItem("mergelab_session");
              setSession(null);
            }}
            style={{ fontSize: "0.85rem", padding: "0.25rem 0.75rem" }}
          >
            Sign out
          </button>
        }
      >
        <TokenSuccessView session={session} isNew={true} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Get started"
      title="Create your account"
      subtitle="Publish your interface decisions to DynamoDB before the push."
      footer={
        <>
          Already have an account? <Link to="/login">Log in</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="signup-name">Your Name</label>
          <input
            id="signup-name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Ada Lovelace"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="signup-email">Work Email</label>
          <input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@team.dev"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="signup-workspace">Workspace Name (Optional)</label>
          <input
            id="signup-workspace"
            name="workspace"
            type="text"
            placeholder="acme-app"
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="field">
          <label htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        {error ? (
          <p className="auth-notice" role="alert" style={{ color: "var(--color-block, #d32f2f)" }}>
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
          {loading ? "Creating Account..." : "Create workspace account"}
          <ArrowRight />
        </button>
      </form>
    </AuthShell>
  );
}
