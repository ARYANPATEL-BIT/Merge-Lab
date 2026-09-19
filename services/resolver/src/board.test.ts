import { HEARTBEAT_WINDOW_MS, type Contract } from "@handshake/shared";
import { describe, expect, it } from "vitest";
import { assembleBoard } from "./index.js";

function contract(over: Partial<Contract> & Pick<Contract, "contract_id" | "symbol">): Contract {
  return {
    kind: "function",
    provides: [over.symbol],
    consumes: [],
    deps: [],
    source_ref: "src/x.ts:1",
    origin: "working_tree",
    confidence: 1,
    repo: "acme/app",
    owner: "dev-a",
    branch: "feat/a",
    version: 1,
    status: "declared",
    declared_at: "2026-09-18T09:00:00Z",
    ...over,
  };
}

const NOW = Date.parse("2026-09-18T10:00:00Z");

describe("assembleBoard — branches", () => {
  it("groups contracts by branch with owner, count and heartbeat", () => {
    const contracts = [
      contract({ contract_id: "1", symbol: "getUser", branch: "feat/a", owner: "dev-a", declared_at: "2026-09-18T09:58:00Z" }),
      contract({ contract_id: "2", symbol: "User", kind: "type", branch: "feat/a", owner: "dev-a", declared_at: "2026-09-18T09:59:30Z" }),
      contract({ contract_id: "3", symbol: "Card", branch: "feat/b", owner: "dev-b", declared_at: "2026-09-18T08:00:00Z" }),
    ];

    const { branches } = assembleBoard(contracts, NOW);

    expect(branches).toHaveLength(2);
    // Sorted newest-first by last_reported.
    expect(branches[0]).toMatchObject({
      branch: "feat/a",
      owner: "dev-a",
      contract_count: 2,
      last_reported: "2026-09-18T09:59:30Z",
      status: "active",
    });
    expect(branches[1]).toMatchObject({ branch: "feat/b", contract_count: 1 });
  });

  it("marks a branch dormant when its last heartbeat is outside the window, but still lists it", () => {
    const justOutside = new Date(NOW - HEARTBEAT_WINDOW_MS - 1000).toISOString();
    const { branches } = assembleBoard(
      [contract({ contract_id: "1", symbol: "x", branch: "feat/quiet", declared_at: justOutside })],
      NOW,
    );

    expect(branches).toHaveLength(1);
    expect(branches[0].status).toBe("dormant");
  });

  it("counts `changed` contracts but excludes `abandoned` ones", () => {
    const { branches, contracts } = assembleBoard(
      [
        contract({ contract_id: "1", symbol: "a", branch: "feat/a", status: "changed" }),
        contract({ contract_id: "2", symbol: "b", branch: "feat/a", status: "abandoned" }),
      ],
      NOW,
    );

    expect(branches[0].contract_count).toBe(1);
    expect(contracts.map((c) => c.symbol)).toEqual(["a"]);
  });
});

describe("assembleBoard — drift feed", () => {
  it("surfaces cross-branch findings from the deterministic rule engine", () => {
    const contracts = [
      contract({ contract_id: "a-route", kind: "route", symbol: "POST /users", provides: ["POST /users"], branch: "feat/a", owner: "dev-a" }),
      contract({ contract_id: "b-route", kind: "route", symbol: "POST /users", provides: ["POST /users"], branch: "feat/b", owner: "dev-b" }),
    ];

    const { findings } = assembleBoard(contracts, NOW);

    expect(findings.some((f) => f.rule === "ROUTE_COLLISION")).toBe(true);
    // Same collision reported from both directions collapses to distinct reasons,
    // never a byte-identical duplicate.
    const keys = new Set(findings.map((f) => `${f.rule}|${f.reason}`));
    expect(keys.size).toBe(findings.length);
  });

  it("orders findings newest-first by the drifting branch's activity", () => {
    const contracts = [
      contract({ contract_id: "old", kind: "route", symbol: "GET /a", provides: ["GET /a"], branch: "feat/old", declared_at: "2026-09-18T09:00:00Z" }),
      contract({ contract_id: "old2", kind: "route", symbol: "GET /a", provides: ["GET /a"], branch: "feat/mid", declared_at: "2026-09-18T09:30:00Z" }),
      contract({ contract_id: "dup", kind: "type", symbol: "User", provides: ["User"], branch: "feat/new", declared_at: "2026-09-18T09:59:00Z" }),
      contract({ contract_id: "dup2", kind: "type", symbol: "User", provides: ["User"], branch: "feat/older", declared_at: "2026-09-18T09:05:00Z" }),
    ];

    const { findings } = assembleBoard(contracts, NOW);

    // The newest drifting branch (feat/new, 09:59) leads the feed with its
    // DUP_SYMBOL on `User`, ahead of the older route collisions.
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].rule).toBe("DUP_SYMBOL");
    expect(findings[0].reason).toContain("User");
  });

  it("returns an empty feed when nothing conflicts", () => {
    const contracts = [
      contract({ contract_id: "1", symbol: "getUser", branch: "feat/a" }),
      contract({ contract_id: "2", symbol: "renderCard", branch: "feat/b", owner: "dev-b" }),
    ];
    expect(assembleBoard(contracts, NOW).findings).toEqual([]);
  });
});
