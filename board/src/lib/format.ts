import type { ContractStatus, Origin, Severity } from "@mergelab/shared";

/** "just now", "12s ago", "4m ago", "2h ago", "3d ago" against a reference clock. */
export function relativeTime(iso: string, nowMs: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "unknown";
  const secs = Math.max(0, Math.round((nowMs - then) / 1000));
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Provenance shown next to a contract. */
export function originLabel(origin: Origin): string {
  return origin === "working_tree" ? "working tree" : "inferred";
}

/** Render a shape record inline as `{ field: type, … }`. */
export function shapeInline(shape: Record<string, string>): string {
  const entries = Object.entries(shape);
  if (entries.length === 0) return "{}";
  return `{ ${entries.map(([k, v]) => `${k}: ${v}`).join(", ")} }`;
}

export interface SeverityMeta {
  label: string;
  className: string;
}

/** block/warn/notify → display label + CSS modifier. Colour is never alone. */
export function severityMeta(severity: Severity): SeverityMeta {
  switch (severity) {
    case "block":
      return { label: "Block", className: "sev-block" };
    case "warn":
      return { label: "Warn", className: "sev-warn" };
    case "notify":
      return { label: "Notify", className: "sev-notify" };
  }
}

/** Contract lifecycle status -> CSS modifier for its badge. */
export function statusClassName(status: ContractStatus): string {
  return `status-${status}`;
}

export interface FindingOriginMeta {
  isOpinion: boolean;
  badgeLabel: string;
  badgeClass: string;
  confidenceText?: string;
}

/** Inferred vs deterministic finding metadata. Color, label and confidence. */
export function findingOriginMeta(
  origin?: "deterministic" | "inferred",
  confidence?: number,
): FindingOriginMeta {
  if (origin === "inferred") {
    const pct =
      typeof confidence === "number" ? `${Math.round(confidence * 100)}%` : "";
    return {
      isOpinion: true,
      badgeLabel: "AI Advisory",
      badgeClass: "badge-inferred",
      confidenceText: pct ? `${pct} confidence` : undefined,
    };
  }
  return {
    isOpinion: false,
    badgeLabel: "Rule Fact",
    badgeClass: "badge-fact",
  };
}
