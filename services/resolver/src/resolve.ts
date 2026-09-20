// Versioning + supersession. Pure and deterministic: it never invents a
// contract_id or timestamp (those are P2's job) - it decides version, status,
// and supersession from the incoming declarations and prior contracts alone.

import {
  shapeHash,
  type Contract,
  type ContractStatus,
  type Declaration,
} from "@mergelab/shared";

/** Contract-only fields to drop when comparing a contract's shape to a declaration. */
const CONTRACT_ONLY_KEYS = [
  "contract_id",
  "repo",
  "branch",
  "owner",
  "version",
  "status",
  "supersedes",
  "declared_at",
] as const;

/** The Declaration portion of a Contract, for shapeHash comparison. */
function declarationOf(c: Contract): Declaration {
  const clone: Record<string, unknown> = { ...c };
  for (const key of CONTRACT_ONLY_KEYS) delete clone[key];
  return clone as unknown as Declaration;
}

function isActive(c: Contract): boolean {
  return c.status !== "changed" && c.status !== "abandoned";
}

export type ResolutionAction = "unchanged" | "declared" | "superseding";

/** What should happen to one incoming declaration on publish. */
export interface Resolution {
  declaration: Declaration;
  /** 'unchanged' = idempotent republish; 'declared' = brand new; 'superseding' = new version. */
  action: ResolutionAction;
  /** Target version of the resulting contract (unchanged keeps the prior version). */
  version: number;
  /** Target status of the resulting contract. */
  status: ContractStatus;
  /** contract_id being replaced, when action === 'superseding'. */
  supersedes?: string;
  /** The active prior contract matched by symbol, when one exists. */
  prior?: Contract;
}

export interface ResolveResult {
  resolutions: Resolution[];
  /** Prior contracts to persist with status flipped to 'changed'. */
  superseded: Contract[];
}

/**
 * Resolve incoming declarations against prior contracts:
 *  - identical shapeHash to the active contract -> no-op (idempotent republish)
 *  - different shape -> version + 1, supersedes the prior, prior marked 'changed'
 *  - no active prior -> version 1, status 'declared'
 */
export function resolve(incoming: Declaration[], prior: Contract[]): ResolveResult {
  const active = prior.filter(isActive);
  const resolutions: Resolution[] = [];
  const superseded: Contract[] = [];

  for (const inc of incoming) {
    const current = active
      .filter((c) => c.symbol === inc.symbol)
      .reduce<Contract | undefined>(
        (best, c) => (!best || c.version > best.version ? c : best),
        undefined,
      );

    if (!current) {
      resolutions.push({
        declaration: inc,
        action: "declared",
        version: 1,
        status: "declared",
      });
      continue;
    }

    if (shapeHash(declarationOf(current)) === shapeHash(inc)) {
      resolutions.push({
        declaration: inc,
        action: "unchanged",
        version: current.version,
        status: current.status,
        prior: current,
      });
      continue;
    }

    resolutions.push({
      declaration: inc,
      action: "superseding",
      version: current.version + 1,
      status: "declared",
      supersedes: current.contract_id,
      prior: current,
    });
    superseded.push({ ...current, status: "changed" });
  }

  return { resolutions, superseded };
}
