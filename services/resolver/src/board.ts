// Pure board projection. Groups active contracts into branches (with a
// heartbeat-derived status) and runs the deterministic rule engine across
// branches to produce the drift feed. No AWS, no HTTP, no env, no LLM — the
// Lambda handler and the frontend's demo mode both call this so what a judge
// sees offline is exactly what the deployed board computes.

import {
  HEARTBEAT_WINDOW_MS,
  type BranchSummary,
  type Contract,
  type Finding,
  type GetBoardResponse,
  type Severity,
} from "@handshake/shared";
import { runRules, type Binding } from "./rules.js";

/** Statuses shown on the board — includes `changed`, unlike the rule context. */
const DISPLAYED = new Set(["declared", "implementing", "implemented", "changed"]);
/** Statuses that form the live context the rule engine reasons over. */
const RULE_ACTIVE = new Set(["declared", "implementing", "implemented"]);

/** block first, then warn, then notify. */
const SEVERITY_RANK: Record<Severity, number> = { block: 0, warn: 1, notify: 2 };

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}

/** Most recent `declared_at` in a group, as epoch ms (0 if none parse). */
function latestMs(contracts: Contract[]): number {
  let max = 0;
  for (const c of contracts) {
    const t = Date.parse(c.declared_at);
    if (!Number.isNaN(t) && t > max) max = t;
  }
  return max;
}

function summarizeBranch(branch: string, contracts: Contract[], nowMs: number): BranchSummary {
  // Owner and heartbeat come from the branch's most recently declared contract.
  const latest = contracts.reduce((a, b) =>
    Date.parse(b.declared_at) > Date.parse(a.declared_at) ? b : a,
  );
  const lastMs = latestMs(contracts);
  return {
    branch,
    owner: latest.owner,
    contract_count: contracts.length,
    last_reported: latest.declared_at,
    status: nowMs - lastMs <= HEARTBEAT_WINDOW_MS ? "active" : "dormant",
  };
}

/** A finding plus the branch activity time used only to order the feed. */
interface TimedFinding {
  finding: Finding;
  atMs: number;
}

/**
 * Build the board snapshot for a repo's contracts as of `nowMs`.
 *
 * @param contracts every contract row for the repo (any status).
 * @param nowMs reference time for the active/dormant decision.
 * @param bindingsByBranch registry bindings per branch, feeding STALE_BINDING.
 */
export function assembleBoard(
  contracts: Contract[],
  nowMs: number,
  bindingsByBranch: Record<string, Binding[]> = {},
): GetBoardResponse {
  const displayed = contracts.filter((c) => DISPLAYED.has(c.status));
  const byBranchDisplayed = groupBy(displayed, (c) => c.branch);

  const branches: BranchSummary[] = [...byBranchDisplayed.entries()]
    .map(([branch, cs]) => summarizeBranch(branch, cs, nowMs))
    .sort((a, b) => Date.parse(b.last_reported) - Date.parse(a.last_reported));

  // Findings: evaluate each branch's live declarations against every other
  // branch's live context. A finding is timestamped by the drifting branch's
  // last activity so the feed reads newest-first.
  const ruleActive = contracts.filter((c) => RULE_ACTIVE.has(c.status));
  const byBranchActive = groupBy(ruleActive, (c) => c.branch);
  const timed: TimedFinding[] = [];
  for (const [branch, incoming] of byBranchActive) {
    const others = ruleActive.filter((c) => c.branch !== branch);
    const bindings = bindingsByBranch[branch] ?? [];
    const atMs = latestMs(byBranchDisplayed.get(branch) ?? incoming);
    for (const finding of runRules(incoming, others, bindings)) {
      timed.push({ finding, atMs });
    }
  }

  const seen = new Set<string>();
  const findings: Finding[] = timed
    .sort(
      (a, b) =>
        b.atMs - a.atMs ||
        SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity],
    )
    .filter(({ finding }) => {
      const key = `${finding.rule}|${finding.severity}|${finding.reason}|${[...finding.contract_ids].sort().join(",")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ finding }) => finding);

  const boardContracts = [...displayed].sort(
    (a, b) => a.branch.localeCompare(b.branch) || a.symbol.localeCompare(b.symbol),
  );

  return { branches, contracts: boardContracts, findings };
}
