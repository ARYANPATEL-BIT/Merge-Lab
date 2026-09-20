// Deterministic rule engine. Pure functions over declarations + contracts.
// No AWS, no HTTP, no env, no LLM - P2 wraps this.
//
// Convention: `active` holds contracts owned by OTHER developers (the context a
// writer sees), so any symbol/route match is by definition a different owner.

import {
  depName,
  functionalClassOf,
  type Contract,
  type Declaration,
  type Finding,
  type FunctionalClass,
} from "@mergelab/shared";

/** Human phrasing per functional class: [what it does, plural noun for rivals]. */
const CLASS_PHRASE: Record<FunctionalClass, [string, string]> = {
  http_client: ["HTTP", "HTTP clients"],
  orm: ["database access", "ORMs"],
  test: ["testing", "test runners"],
  validation: ["validation", "validation libraries"],
};

/** A branch's binding to a provider symbol at a specific version. Owned by the
 *  registry (BIND#branch#contract_id); P2 supplies these from DynamoDB. */
export interface Binding {
  symbol: string;
  version: number;
}

/** Collapse camelCase / snake_case / PascalCase / kebab to one canonical form. */
function normalizeField(name: string): string {
  return name.replace(/[_-]/g, "").toLowerCase();
}

/** DEP_CONFLICT (block): incoming dep shares a functional class with an active
 *  dep of a different name. */
function depConflict(incoming: Declaration[], active: Contract[]): Finding[] {
  const findings: Finding[] = [];
  const activeDeps = active.filter((c) => c.kind === "dependency");
  for (const inc of incoming) {
    if (inc.kind !== "dependency") continue;
    const incClass = functionalClassOf(inc.symbol);
    if (!incClass) continue;
    const incName = depName(inc.symbol);
    for (const a of activeDeps) {
      if (functionalClassOf(a.symbol) !== incClass) continue;
      if (depName(a.symbol) === incName) continue;
      const [phrase, plural] = CLASS_PHRASE[incClass];
      findings.push({
        rule: "DEP_CONFLICT",
        severity: "block",
        reason: `This repo uses ${a.symbol} for ${phrase} (${a.owner}, ${a.branch}). Adding ${inc.symbol} means two ${plural}.`,
        contract_ids: [a.contract_id],
      });
    }
  }
  return findings;
}

/** Active contracts that provide a symbol this declaration consumes and carry a shape. */
function consumedProviders(inc: Declaration, active: Contract[]): Contract[] {
  const consumed = new Set(inc.consumes);
  return active.filter(
    (a) => a.shape !== undefined && a.provides.some((s) => consumed.has(s)),
  );
}

/** NAMING_DRIFT (block): an incoming shape field is a case-variant of a field in
 *  a consumed contract's shape. */
function namingDrift(incoming: Declaration[], active: Contract[]): Finding[] {
  const findings: Finding[] = [];
  for (const inc of incoming) {
    if (!inc.shape) continue;
    for (const a of consumedProviders(inc, active)) {
      const providerNorm = new Map(
        Object.keys(a.shape ?? {}).map((f) => [normalizeField(f), f]),
      );
      for (const field of Object.keys(inc.shape)) {
        const match = providerNorm.get(normalizeField(field));
        if (match && match !== field) {
          findings.push({
            rule: "NAMING_DRIFT",
            severity: "block",
            reason: `Field ${field} drifts from ${match} in ${a.symbol} (declared by ${a.owner} on ${a.branch}); match the existing casing.`,
            contract_ids: [a.contract_id],
          });
        }
      }
    }
  }
  return findings;
}

/** DUP_SYMBOL (warn): a provided symbol is already declared by a different owner.
 *  Routes are handled by ROUTE_COLLISION instead. */
function dupSymbol(incoming: Declaration[], active: Contract[]): Finding[] {
  const findings: Finding[] = [];
  for (const inc of incoming) {
    if (inc.kind === "dependency" || inc.kind === "route") continue;
    for (const symbol of inc.provides) {
      for (const a of active) {
        if (a.kind === "route" || !a.provides.includes(symbol)) continue;
        findings.push({
          rule: "DUP_SYMBOL",
          severity: "warn",
          reason: `${symbol} is already declared by ${a.owner} on ${a.branch}; pick a different name or coordinate.`,
          contract_ids: [a.contract_id],
        });
      }
    }
  }
  return findings;
}

/** ROUTE_COLLISION (block): identical method+path already declared by another owner. */
function routeCollision(incoming: Declaration[], active: Contract[]): Finding[] {
  const findings: Finding[] = [];
  const activeRoutes = active.filter((c) => c.kind === "route");
  for (const inc of incoming) {
    if (inc.kind !== "route") continue;
    for (const a of activeRoutes) {
      if (a.symbol !== inc.symbol) continue;
      findings.push({
        rule: "ROUTE_COLLISION",
        severity: "block",
        reason: `Route ${inc.symbol} is already declared by ${a.owner} on ${a.branch}; two handlers would collide.`,
        contract_ids: [a.contract_id],
      });
    }
  }
  return findings;
}

/** SHAPE_MISMATCH (block): a consumed symbol references a field absent from the
 *  provider's active shape (case-variants belong to NAMING_DRIFT, not here). */
function shapeMismatch(incoming: Declaration[], active: Contract[]): Finding[] {
  const findings: Finding[] = [];
  for (const inc of incoming) {
    if (!inc.shape) continue;
    for (const a of consumedProviders(inc, active)) {
      const providerFields = Object.keys(a.shape ?? {});
      const providerNorm = new Set(providerFields.map(normalizeField));
      for (const field of Object.keys(inc.shape)) {
        if (providerFields.includes(field)) continue;
        if (providerNorm.has(normalizeField(field))) continue;
        findings.push({
          rule: "SHAPE_MISMATCH",
          severity: "block",
          reason: `${a.symbol}.${field} does not exist on the ${a.symbol} shape declared by ${a.owner} on ${a.branch}.`,
          contract_ids: [a.contract_id],
        });
      }
    }
  }
  return findings;
}

/** STALE_BINDING (notify): a registry binding pins this branch to a version
 *  older than the provider's current active version. No bindings -> never fires. */
function staleBinding(active: Contract[], bindings: Binding[]): Finding[] {
  if (bindings.length === 0) return [];
  const current = new Map<string, Contract>();
  for (const a of active) {
    for (const symbol of a.provides) {
      const seen = current.get(symbol);
      if (!seen || a.version > seen.version) current.set(symbol, a);
    }
  }
  const findings: Finding[] = [];
  for (const b of bindings) {
    const provider = current.get(b.symbol);
    if (!provider || provider.version <= b.version) continue;
    findings.push({
      rule: "STALE_BINDING",
      severity: "notify",
      reason: `You are pinned to ${b.symbol} v${b.version} but ${provider.owner} has published v${provider.version} on ${provider.branch}.`,
      contract_ids: [provider.contract_id],
    });
  }
  return findings;
}

/** Run all six rules deterministically, in a fixed order. `bindings` (from the
 *  registry) drive STALE_BINDING; omit them and that rule stays silent. */
export function runRules(
  incoming: Declaration[],
  active: Contract[],
  bindings: Binding[] = [],
): Finding[] {
  return [
    ...depConflict(incoming, active),
    ...namingDrift(incoming, active),
    ...dupSymbol(incoming, active),
    ...routeCollision(incoming, active),
    ...shapeMismatch(incoming, active),
    ...staleBinding(active, bindings),
  ];
}
