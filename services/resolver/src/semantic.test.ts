import { describe, expect, it } from "vitest";
import type { Contract, Declaration } from "@mergelab/shared";
import { findSemanticCandidates } from "./semantic.js";

const makeDecl = (overrides: Partial<Declaration> = {}): Declaration => ({
  kind: "function",
  symbol: "formatDate",
  signature: "formatDate(d: Date) -> string",
  provides: ["formatDate"],
  consumes: [],
  deps: [],
  source_ref: "src/date.ts:1",
  origin: "working_tree",
  confidence: 1,
  ...overrides,
});

const makeContract = (overrides: Partial<Contract> = {}): Contract => ({
  ...makeDecl(),
  contract_id: "ct_existing",
  repo: "acme/app",
  branch: "main",
  owner: "alice",
  version: 1,
  status: "implemented",
  declared_at: new Date().toISOString(),
  ...overrides,
});

describe("findSemanticCandidates", () => {
  it("pairs functions with different symbols that passed all 6 deterministic rules", () => {
    const inc = makeDecl({
      symbol: "toDisplayDate",
      signature: "toDisplayDate(date: Date) -> string",
      provides: ["toDisplayDate"],
    });

    const active = [
      makeContract({
        symbol: "formatDate",
        signature: "formatDate(d: Date) -> string",
        provides: ["formatDate"],
        branch: "feat/date-utils",
        owner: "bob",
      }),
    ];

    const candidates = findSemanticCandidates([inc], active);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].incoming.symbol).toBe("toDisplayDate");
    expect(candidates[0].target.symbol).toBe("formatDate");
  });

  it("pairs types with different symbols that passed all 6 deterministic rules", () => {
    const inc = makeDecl({
      kind: "type",
      symbol: "UserAccount",
      shape: { id: "string", email: "string" },
      provides: ["UserAccount"],
    });

    const active = [
      makeContract({
        kind: "type",
        symbol: "UserProfile",
        shape: { id: "string", email: "string" },
        provides: ["UserProfile"],
        branch: "feat/user",
        owner: "charlie",
      }),
    ];

    const candidates = findSemanticCandidates([inc], active);
    expect(candidates).toHaveLength(1);
  });

  it("ignores non-function non-type declarations (e.g. dependencies, routes, env)", () => {
    const inc = makeDecl({
      kind: "dependency",
      symbol: "axios@1.7.2",
      provides: [],
    });

    const active = [
      makeContract({
        kind: "dependency",
        symbol: "got@12.0.0",
        provides: [],
        branch: "feat/http",
      }),
    ];

    const candidates = findSemanticCandidates([inc], active);
    expect(candidates).toHaveLength(0);
  });

  it("ignores declarations on the same branch", () => {
    const inc = makeContract({
      symbol: "formatDate",
      branch: "feat/date",
    });

    const active = [
      makeContract({
        symbol: "toDisplayDate",
        branch: "feat/date",
      }),
    ];

    const candidates = findSemanticCandidates([inc], active);
    expect(candidates).toHaveLength(0);
  });

  it("ignores declarations with identical symbols (handled by DUP_SYMBOL)", () => {
    const inc = makeDecl({
      symbol: "getUser",
      provides: ["getUser"],
    });

    const active = [
      makeContract({
        symbol: "getUser",
        provides: ["getUser"],
        branch: "feat/users",
      }),
    ];

    // Identical symbols will trigger DUP_SYMBOL deterministic finding
    const candidates = findSemanticCandidates([inc], active);
    expect(candidates).toHaveLength(0);
  });

  it("ignores pairs that violate deterministic rules (e.g. naming drift)", () => {
    const inc = makeDecl({
      kind: "function",
      symbol: "renderProfile",
      shape: { userId: "string" },
      consumes: ["User"],
      provides: ["renderProfile"],
    });

    const active = [
      makeContract({
        kind: "type",
        symbol: "User",
        shape: { user_id: "string" },
        provides: ["User"],
        branch: "feat/user",
      }),
    ];

    // Different kind (function vs type) anyway, but also triggers naming drift
    const candidates = findSemanticCandidates([inc], active);
    expect(candidates).toHaveLength(0);
  });
});
