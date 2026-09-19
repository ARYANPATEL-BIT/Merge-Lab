// Login / sign-up screens. These are DESIGN MOCKUPS: Merge Lab has no accounts —
// the registry authenticates with a per-workspace bearer token, not user login —
// so the forms are non-functional and say so plainly. They exist to show the
// design system extending to an auth surface, in the same warm palette, shared
// pill nav, dark-matter background and monospace labels as the rest of the app.

import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, PillNav } from "./Nav.js";
import { ThemeToggle } from "./theme.js";
import { Cursor } from "./Cursor.js";
import { richMotionAllowed, useDocumentTitle } from "./motion.js";

const RippleWater = lazy(() =>
  import("./RippleWater.js").then((m) => ({ default: m.RippleWater })),
);

function Field({
  id,
  label,
  type,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  type: string;
  autoComplete: string;
  placeholder: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={id} type={type} autoComplete={autoComplete} placeholder={placeholder} />
    </div>
  );
}

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
          <p className="auth-preview mono">
            Design preview — Merge Lab authenticates with a per-workspace token, not
            accounts. These fields don't submit anywhere.
          </p>
          <div className="auth-footer">{footer}</div>
        </div>
      </main>
    </div>
  );
}

function useMockSubmit() {
  const [notice, setNotice] = useState<string | null>(null);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setNotice("This is a design preview — accounts aren't part of Merge Lab.");
  };
  return { notice, onSubmit };
}

export function Login() {
  useDocumentTitle("Log in — Merge Lab");
  const { notice, onSubmit } = useMockSubmit();
  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Log in"
      subtitle="Pick up where your working tree left off."
      footer={
        <>
          New to Merge Lab? <Link to="/signup">Create an account</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <Field id="email" label="Email" type="email" autoComplete="email" placeholder="you@team.dev" />
        <Field id="password" label="Password" type="password" autoComplete="current-password" placeholder="••••••••" />
        <button type="submit" className="btn btn-primary auth-submit">
          Log in
          <ArrowRight />
        </button>
        {notice ? (
          <p className="auth-notice" role="status">
            {notice}
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}

export function Signup() {
  useDocumentTitle("Sign up — Merge Lab");
  const { notice, onSubmit } = useMockSubmit();
  return (
    <AuthShell
      eyebrow="Get started"
      title="Create your account"
      subtitle="Publish your interface decisions before the push."
      footer={
        <>
          Already have an account? <Link to="/login">Log in</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <Field id="name" label="Name" type="text" autoComplete="name" placeholder="Ada Lovelace" />
        <Field id="email" label="Email" type="email" autoComplete="email" placeholder="you@team.dev" />
        <Field id="password" label="Password" type="password" autoComplete="new-password" placeholder="At least 12 characters" />
        <button type="submit" className="btn btn-primary auth-submit">
          Create account
          <ArrowRight />
        </button>
        {notice ? (
          <p className="auth-notice" role="status">
            {notice}
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}
