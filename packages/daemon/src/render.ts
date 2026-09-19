// Renders the context block read at SessionStart (and printed by `handshake
// context`). Plain factual statements only — never imperative instructions —
// because text framed as commands trips the model's prompt-injection defences
// and gets surfaced to the user instead of used. Lives here so the CLI and the
// hook render identically.

import {
  depName,
  functionalClassOf,
  FUNCTIONAL_CLASSES,
  type Contract,
  type FunctionalClass,
} from "@handshake/shared";

export interface RenderInput {
  repo: string;
  branch: string;
  contracts: Contract[];
  now: Date;
}

/** Whole-block token budget; sections drop lowest-priority-first to fit. */
const TOKEN_BUDGET = 600;
const CONSUMABLE_KINDS = new Set(["function", "type", "route"]);

const CLASS_LABEL: Record<FunctionalClass, string> = {
  http_client: "HTTP client is",
  orm: "ORM is",
  test: "Test runner is",
  validation: "Validation library is",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function renderShape(shape: Record<string, string>): string {
  const fields = Object.entries(shape).map(([k, t]) => `${k}: ${t}`);
  return fields.length === 0 ? "{}" : `{ ${fields.join(", ")} }`;
}

/** The declaration line for a consumable contract: names and types only. */
function renderSignature(c: Contract): string {
  if (c.kind === "function") {
    if (c.signature) {
      const arrow = c.signature.indexOf(" -> ");
      if (c.shape && arrow >= 0) {
        return `${c.signature.slice(0, arrow)} -> ${renderShape(c.shape)}`;
      }
      return c.signature;
    }
    return c.symbol;
  }
  if (c.kind === "type") {
    return c.shape ? `${c.symbol} ${renderShape(c.shape)}` : c.symbol;
  }
  return c.symbol; // route
}

function renderContractBlock(c: Contract): string {
  const meta = `  owner ${c.owner}, branch ${c.branch}, status ${c.status}.`;
  return `- ${renderSignature(c)}\n${meta}`;
}

/**
 * Conventions inferred from the returned contracts: the dominant member of each
 * functional dependency class present, then the dominant field-name casing.
 */
function deriveConventions(contracts: Contract[]): string[] {
  const counts = new Map<FunctionalClass, Map<string, number>>();
  for (const c of contracts) {
    for (const dep of c.deps) {
      const cls = functionalClassOf(dep);
      if (!cls) continue;
      const perClass = counts.get(cls) ?? new Map<string, number>();
      const name = depName(dep);
      perClass.set(name, (perClass.get(name) ?? 0) + 1);
      counts.set(cls, perClass);
    }
  }

  const lines: string[] = [];
  for (const cls of Object.keys(FUNCTIONAL_CLASSES) as FunctionalClass[]) {
    const perClass = counts.get(cls);
    if (!perClass) continue;
    const dominant = [...perClass.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0][0];
    lines.push(`${CLASS_LABEL[cls]} ${dominant}.`);
  }

  let snake = 0;
  let camel = 0;
  for (const c of contracts) {
    if (!c.shape) continue;
    for (const field of Object.keys(c.shape)) {
      if (field.includes("_")) snake++;
      else if (/[a-z][A-Z]/.test(field)) camel++;
    }
  }
  if (snake > camel) lines.push("Object fields are snake_case.");
  else if (camel > snake) lines.push("Object fields are camelCase.");

  return lines;
}

/**
 * The reporting-branches line, always printed. With no contracts it reads
 * "none" — absence of data must read as absence, never as "nobody is here."
 */
function renderReporting(contracts: Contract[]): string {
  const ownerByBranch = new Map<string, string>();
  for (const c of contracts) {
    if (!ownerByBranch.has(c.branch)) ownerByBranch.set(c.branch, c.owner);
  }
  const tail = "Others may exist but are not reporting.";
  if (ownerByBranch.size === 0) return `Reporting branches: none. ${tail}`;
  const list = [...ownerByBranch].map(([branch, owner]) => `${branch} (${owner})`).join(", ");
  return `Reporting branches: ${list}. ${tail}`;
}

function assemble(
  header: string,
  contractBlocks: string[],
  conventions: string[],
  reporting: string,
): string {
  const parts: string[] = [header];
  if (contractBlocks.length > 0) {
    parts.push("", "Contracts this branch can consume:", ...contractBlocks);
  }
  if (conventions.length > 0) {
    parts.push("", "Conventions in force on this repo:", ...conventions.map((l) => `- ${l}`));
  }
  parts.push("", reporting);
  return parts.join("\n");
}

export function renderContext(input: RenderInput): string {
  const { repo, branch, contracts, now } = input;
  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const header = `Handshake — repo ${repo}, branch ${branch}, as of ${time}.`;

  const contractBlocks = contracts
    .filter((c) => CONSUMABLE_KINDS.has(c.kind))
    .map(renderContractBlock);
  const conventions = deriveConventions(contracts);
  const reporting = renderReporting(contracts);

  // Fit the budget lowest-priority-first: drop conventions, then trim contracts
  // from the tail. Header and the reporting line always survive.
  let blocks = contractBlocks;
  let convs = conventions;
  let out = assemble(header, blocks, convs, reporting);
  if (estimateTokens(out) > TOKEN_BUDGET) {
    convs = [];
    out = assemble(header, blocks, convs, reporting);
  }
  while (estimateTokens(out) > TOKEN_BUDGET && blocks.length > 0) {
    blocks = blocks.slice(0, -1);
    out = assemble(header, blocks, convs, reporting);
  }
  return out;
}
