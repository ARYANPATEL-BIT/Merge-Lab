// The floating pill navbar, shared by both routes so "/" and "/board" read as one
// product. The brand always links home; `center` holds route nav links, `children`
// holds the route's right-hand actions (the landing CTA, or the board's status +
// theme toggle).

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

export function ArrowRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden={true}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <span className="wordmark-dot" aria-hidden={true} />
      Merge&nbsp;Lab
    </span>
  );
}

export function PillNav({ center, children }: { center?: ReactNode; children?: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav className={`nav ${scrolled ? "is-scrolled" : ""}`} aria-label="Primary">
      <Link className="nav-brand" to="/" aria-label="Merge Lab home">
        <Wordmark />
      </Link>
      {center ? <div className="nav-links">{center}</div> : null}
      {children ? <div className="nav-right">{children}</div> : null}
    </nav>
  );
}
