// Small shared building blocks for the workspace pages. They lean entirely on
// the landing page's design tokens (--fg, --border, --surface, --radius…) so
// there is no new palette to maintain.

import { useState, type CSSProperties, type ReactNode } from "react";

/** A bordered card, matching the auth card's borders and radius. */
export function panel(): CSSProperties {
  return {
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    background: "var(--surface)",
    padding: "1.25rem",
  };
}

/** The inset, monospace box used to show a code/token value. */
export function tokenBox(): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "0.4rem 0.6rem",
    fontSize: "0.8rem",
    fontFamily: "var(--font-mono)",
    overflowWrap: "anywhere",
    wordBreak: "break-all",
  };
}

export function Notice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  const color = tone === "error" ? "var(--sev-block)" : "var(--ok)";
  return (
    <p
      className="auth-notice"
      role={tone === "error" ? "alert" : "status"}
      style={{ color, margin: "0.25rem 0 0" }}
    >
      {children}
    </p>
  );
}

/** Copy a value to the clipboard, flashing "Copied!" for confirmation. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem", minHeight: "auto", flexShrink: 0 }}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
