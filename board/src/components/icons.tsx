import type { Severity } from "@mergelab/shared";

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Distinct glyph per severity so meaning survives without colour. */
export function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === "block") {
    // No-entry / octagon.
    return (
      <svg {...base}>
        <path d="M7.9 2.9h8.2L21.1 8v8.2L16.1 21H7.9L2.9 16.1V7.9z" />
        <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" />
      </svg>
    );
  }
  if (severity === "warn") {
    // Triangle with bang.
    return (
      <svg {...base}>
        <path d="M12 3 2.5 20h19z" />
        <line x1="12" y1="10" x2="12" y2="14" />
        <line x1="12" y1="17.5" x2="12" y2="17.5" />
      </svg>
    );
  }
  // notify - info circle.
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11.5" x2="12" y2="16" />
      <line x1="12" y1="8" x2="12" y2="8" />
    </svg>
  );
}

/** A small crossed-arrows "mergelab" mark for the wordmark. */
export function BrandMark() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none" aria-hidden={true}>
      <path
        d="M3 12h4l2-2 3 3 3-3 2 2h4"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 10l3-3 3 3"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.55}
      />
    </svg>
  );
}

/** Empty-state check-shield used when there is no drift. */
export function ShieldCheck() {
  return (
    <svg width={40} height={40} viewBox="0 0 24 24" fill="none" aria-hidden={true}>
      <path
        d="M12 3 5 6v5c0 4.5 3 8 7 9 4-1 7-4.5 7-9V6z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <path
        d="M9 12l2 2 4-4"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Sun (offer light) / moon (offer dark) for the theme toggle. */
export function ThemeIcon({ target }: { target: "light" | "dark" }) {
  if (target === "light") {
    return (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden={true}>
        <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth={2} />
        <g stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <line x1="12" y1="2.5" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="21.5" />
          <line x1="2.5" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="21.5" y2="12" />
          <line x1="5.2" y1="5.2" x2="7" y2="7" />
          <line x1="17" y1="17" x2="18.8" y2="18.8" />
          <line x1="18.8" y1="5.2" x2="17" y2="7" />
          <line x1="7" y1="17" x2="5.2" y2="18.8" />
        </g>
      </svg>
    );
  }
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden={true}>
      <path
        d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Empty-state inbox used when a region has no data yet. */
export function InboxIcon() {
  return (
    <svg width={40} height={40} viewBox="0 0 24 24" fill="none" aria-hidden={true}>
      <path
        d="M4 13l2.5-7h11L20 13v5H4z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <path
        d="M4 13h4l1.5 2h5L16 13h4"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
