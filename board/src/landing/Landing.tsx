import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Cursor } from "./Cursor.js";
import { ArrowRight, PillNav, Wordmark } from "./Nav.js";
import { ThemeToggle } from "./theme.js";

// three.js is heavy and only ever runs on desktop with motion allowed, so it is
// code-split into its own chunk and never downloaded on mobile or reduced-motion.
const RippleWater = lazy(() =>
  import("./RippleWater.js").then((m) => ({ default: m.RippleWater })),
);
import {
  richMotionAllowed,
  useDocumentTitle,
  useReveals,
} from "./motion.js";
import {
  AWS_SERVICES,
  CAPABILITIES,
  CONTEXT_BLOCK,
  GITHUB_URL,
  RULES,
  STATS,
  STEPS,
} from "./content.js";
import {
  ArchitectureDiagram,
  DeclarationsDiagram,
  ExtractionDiagram,
  InjectionDiagram,
  RulesDiagram,
} from "./diagrams.js";

const CAP_DIAGRAMS = [
  <ExtractionDiagram key="0" />,
  <RulesDiagram key="1" />,
  <InjectionDiagram key="2" />,
  <DeclarationsDiagram key="3" />,
];

const SEV_LABEL: Record<string, string> = {
  block: "Block",
  warn: "Warn",
  notify: "Notify",
};

export function Landing() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [rich, setRich] = useState(false);

  useDocumentTitle("Merge Lab — the pre-push context layer");
  useReveals(rootRef);

  // Enable WebGL + custom cursor only on desktop, fine-pointer, motion-allowed.
  // Theme is managed by the shared toggle (light default, follows OS otherwise).
  useEffect(() => {
    setRich(richMotionAllowed());
  }, []);

  return (
    <div className="landing" ref={rootRef} id="top">
      {rich ? <Cursor /> : null}
      <PillNav
        center={
          <>
            <a href="#how">How it works</a>
            <a href="#rules">The rules</a>
            <a href="#aws">Built on</a>
          </>
        }
      >
        <ThemeToggle />
        <Link className="nav-login" to="/login">
          Log in
        </Link>
        <Link className="btn btn-primary nav-cta" to="/board">
          Open the board
          <ArrowRight />
        </Link>
      </PillNav>

      {/* 1 — HERO */}
      <header className="hero">
        {rich ? (
          <Suspense fallback={null}>
            <RippleWater />
          </Suspense>
        ) : null}
        <div className="hero-inner" data-reveal>
          <p className="label">Merge&nbsp;Lab — The pre-push context layer</p>
          <h1 className="hero-title">
            <span className="line-ink">Stop waiting</span>
            <span className="line-grey">for the push.</span>
          </h1>
          <p className="hero-sub">
            Merge Lab publishes your teammates' interface decisions — signatures,
            data shapes, deps, routes — straight from their working tree, before
            anything is committed.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" to="/board">
              Open the board
              <ArrowRight />
            </Link>
            <a className="btn btn-secondary" href={GITHUB_URL} target="_blank" rel="noreferrer">
              Read the docs
            </a>
          </div>
        </div>
        <div className="hero-fade" aria-hidden={true} />
      </header>

      {/* 2 — THE PROBLEM */}
      <section className="section problem" aria-labelledby="problem-title">
        <div className="section-inner">
          <div className="problem-grid" data-reveal>
            <div className="problem-lede">
              <p className="label">The problem</p>
              <h2 id="problem-title" className="section-title">
                The decision takes five minutes. The wait takes three hours.
              </h2>
            </div>
            <div className="problem-body">
              <p>
                An interface decision — the shape of <code className="mono">User</code>,
                the name of a route, which HTTP client the repo standardises on — is
                made in the first five minutes of a session.
              </p>
              <p>
                Its implementation takes the next three hours. Today the push is the
                only channel that carries it, so the developer who depends on that
                decision waits the full three hours to find out what it was — and
                builds against a guess in the meantime.
              </p>
              <p className="problem-punch">
                Merge Lab moves the decision onto the wire the moment it exists, not
                the moment it ships.
              </p>
            </div>
          </div>
          <ol className="timeline" data-reveal>
            <li>
              <span className="timeline-t mono">00:05</span>
              <span className="timeline-e">Interface decided in the working tree</span>
            </li>
            <li>
              <span className="timeline-t mono">00:05</span>
              <span className="timeline-e">Merge Lab publishes the declaration</span>
            </li>
            <li>
              <span className="timeline-t mono">03:00</span>
              <span className="timeline-e">Old world: the push finally lands</span>
            </li>
          </ol>
        </div>
      </section>

      {/* 3 — HOW IT WORKS (inverted) */}
      <section className="section invert" id="how" aria-labelledby="how-title">
        <div className="section-inner">
          <div className="how-head" data-reveal>
            <p className="label">How it works</p>
            <h2 id="how-title" className="section-title">
              Declare, inject, block — three deterministic steps.
            </h2>
          </div>
          <div className="how-grid">
            <ol className="steps" data-reveal>
              {STEPS.map((s) => (
                <li className="step" key={s.n}>
                  <span className="step-n mono">{s.n}</span>
                  <div className="step-text">
                    <h3 className="step-name">
                      {s.name}
                      <span className="step-where mono">{s.where}</span>
                    </h3>
                    <p>{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <figure className="terminal" data-reveal>
              <div className="terminal-bar" aria-hidden={true}>
                <span className="terminal-dot" />
                <span className="terminal-dot" />
                <span className="terminal-dot" />
                <span className="terminal-name mono">SessionStart · context injected</span>
              </div>
              <pre className="terminal-body mono">{CONTEXT_BLOCK}</pre>
              <figcaption className="terminal-cap mono">
                The exact block render.ts emits for the demo dataset — the whole
                payload is names and types.
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* 4 — CAPABILITIES */}
      <section className="section caps" id="caps" aria-labelledby="caps-title">
        <div className="section-inner">
          <div className="caps-head" data-reveal>
            <p className="label">Capabilities</p>
            <h2 id="caps-title" className="section-title">
              What the registry actually does.
            </h2>
          </div>
          <div className="cap-rows">
            {CAPABILITIES.map((c, i) => (
              <article className="cap-row" data-reveal key={c.n}>
                <span className="cap-n mono">{c.n}</span>
                <div className="cap-text">
                  <h3 className="cap-title">{c.title}</h3>
                  <p>{c.body}</p>
                </div>
                <div className="cap-art" aria-hidden={true}>
                  {CAP_DIAGRAMS[i]}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 5 — THE RULES */}
      <section className="section rules" id="rules" aria-labelledby="rules-title">
        <div className="section-inner">
          <div className="rules-head" data-reveal>
            <p className="label">The rules</p>
            <h2 id="rules-title" className="section-title">
              Six rules. No model in the enforcement path.
            </h2>
            <p className="rules-note">
              Every verdict is one of these, decided deterministically. The reason
              is a plain string the writer can read — shown here as emitted for the
              demo dataset.
            </p>
          </div>
          <ul className="rule-list" data-reveal>
            {RULES.map((r) => (
              <li className={`rule sev-${r.severity}`} key={r.id}>
                <div className="rule-top">
                  <span className="rule-id mono">{r.id}</span>
                  <span className="rule-sev mono">{SEV_LABEL[r.severity]}</span>
                </div>
                <p className="rule-reason mono">{r.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 6 — NUMBERS */}
      <section className="section numbers" aria-labelledby="numbers-title">
        <div className="section-inner">
          <div className="numbers-head" data-reveal>
            <p className="label">By the numbers</p>
            <h2 id="numbers-title" className="section-title">
              Every figure is true of this repo.
            </h2>
          </div>
          <dl className="stat-grid" data-reveal>
            {STATS.map((s) => (
              <div className="stat" key={s.label}>
                <dt className="stat-value">{s.value}</dt>
                <dd className="stat-label mono">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 7 — BUILT ON AWS */}
      <section className="section aws" id="aws" aria-labelledby="aws-title">
        <div className="section-inner">
          <div className="aws-head" data-reveal>
            <p className="label">Built on AWS</p>
            <h2 id="aws-title" className="section-title">
              Serverless, single-table, ap-south-1.
            </h2>
          </div>
          <div className="aws-diagram" data-reveal>
            <ArchitectureDiagram />
          </div>
          <ul className="aws-list" data-reveal>
            {AWS_SERVICES.map((s) => (
              <li className="aws-item" key={s.name}>
                <span className="aws-name">{s.name}</span>
                <span className="aws-role">{s.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 8 — CTA + FOOTER */}
      <section className="section cta" aria-labelledby="cta-title">
        <div className="section-inner cta-inner" data-reveal>
          <p className="label">Open the board</p>
          <h2 id="cta-title" className="cta-title">
            See every branch's contracts,
            <br />
            live and in one place.
          </h2>
          <div className="hero-actions">
            <Link className="btn btn-primary" to="/board">
              Open the board
              <ArrowRight />
            </Link>
            <a className="btn btn-secondary" href={GITHUB_URL} target="_blank" rel="noreferrer">
              Read the docs
            </a>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="section-inner footer-inner">
          <Wordmark />
          <p className="footer-tag mono">The pre-push context layer</p>
          <div className="footer-links">
            <Link to="/board">Board</Link>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
