// Pure candidate pairing for Tier-2 semantic duplicate analysis.
// No AWS, no HTTP, no env, no LLM. Wraps the deterministic rule engine to ensure
// semantic checks only evaluate declarations that passed all six Tier-1 rules.

import type { Contract, Declaration } from "@mergelab/shared";
import { runRules } from "./rules.js";

export interface SemanticCandidatePair {
  incoming: Declaration | Contract;
  target: Contract;
}

/**
 * Finds pairs of declarations on different branches that:
 * 1. Share the same kind ('function' or 'type').
 * 2. Differ in symbol name (identical names are handled by DUP_SYMBOL in Tier 1).
 * 3. Passed all six deterministic rules with zero findings.
 */
export function findSemanticCandidates(
  incoming: (Declaration | Contract)[],
  active: Contract[],
): SemanticCandidatePair[] {
  const candidates: SemanticCandidatePair[] = [];

  for (const inc of incoming) {
    if (inc.kind !== "function" && inc.kind !== "type") continue;

    const incBranch = "branch" in inc ? inc.branch : undefined;

    for (const target of active) {
      // Must be the same kind
      if (target.kind !== inc.kind) continue;

      // Must be on a different branch if branch is known
      if (incBranch && target.branch === incBranch) continue;

      // Must differ in symbol name (identical symbols trigger DUP_SYMBOL)
      if (target.symbol === inc.symbol) continue;

      // Must pass all six deterministic rules (no Tier-1 findings)
      const deterministicFindings = runRules([inc], [target]);
      if (deterministicFindings.length > 0) continue;

      candidates.push({ incoming: inc, target });
    }
  }

  return candidates;
}
