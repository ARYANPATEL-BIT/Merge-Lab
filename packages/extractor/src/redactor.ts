// Redactor — applied to every Declaration before it is returned. Enforces the
// "names and types only" hard rule. Returns null to DROP a Declaration.

import type { Declaration } from "@handshake/shared";

const REDACTED = "<redacted>";
const SENSITIVE = /(secret|token|password|apikey|api_key|private_key)/i;
const SENSITIVE_GLOBAL = new RegExp(SENSITIVE.source, "gi");
const MAX_BYTES = 2048;

/** Rule 2: never publish declarations sourced from secret-bearing files. */
function fromForbiddenSource(sourceRef: string): boolean {
  const path = sourceRef.split(":")[0] ?? sourceRef;
  const base = path.split(/[\\/]/).pop() ?? path;
  if (/^\.env(\.|$)/.test(base)) return true; // .env, .env.local, ...
  if (/\.(pem|key)$/i.test(base)) return true; // *.pem, *.key
  if (/(^|[\\/])secrets[\\/]/.test(path)) return true; // secrets/
  return false;
}

/** Rule 1: widen string/number/boolean literals to their base type. */
function stripLiterals(text: string): string {
  return text
    .replace(/'[^']*'|"[^"]*"/g, "string")
    .replace(/\b(?:true|false)\b/g, "boolean")
    .replace(/(^|[^\w.])-?\d+(?:\.\d+)?\b/g, (_m, prefix: string) => `${prefix}number`);
}

/** Rule 3: mask a whole identifier if it looks sensitive. */
function maskName(name: string): string {
  return SENSITIVE.test(name) ? REDACTED : name;
}

/** Rule 3: mask sensitive identifier substrings inside a type/signature string. */
function maskText(text: string): string {
  return text.replace(SENSITIVE_GLOBAL, REDACTED);
}

export function redact(d: Declaration): Declaration | null {
  // Rule 2 — drop by source before doing any work.
  if (fromForbiddenSource(d.source_ref)) return null;

  const out: Declaration = {
    ...d,
    symbol: maskName(d.symbol),
    provides: d.provides.map(maskName),
    consumes: d.consumes.map(maskName),
  };

  if (d.signature !== undefined) {
    out.signature = maskText(stripLiterals(d.signature));
  }
  if (d.shape !== undefined) {
    const shape: Record<string, string> = {};
    for (const [key, value] of Object.entries(d.shape)) {
      shape[maskName(key)] = maskText(stripLiterals(value));
    }
    out.shape = shape;
  }

  // Rule 4 — drop (never truncate) anything serialising over 2KB.
  if (JSON.stringify(out).length > MAX_BYTES) return null;

  return out;
}
