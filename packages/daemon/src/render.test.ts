import { describe, expect, it } from "vitest";
import type { Contract } from "@handshake/shared";
import { renderContext } from "./render.js";

function contract(partial: Partial<Contract> & Pick<Contract, "kind" | "symbol">): Contract {
  return {
    provides: [],
    consumes: [],
    deps: [],
    source_ref: "src/x.ts:1",
    origin: "working_tree",
    confidence: 1,
    contract_id: "c1",
    repo: "acme/widgets",
    branch: "feat/user-api",
    owner: "dev-a",
    version: 1,
    status: "declared",
    declared_at: "2026-09-19T00:00:00.000Z",
    ...partial,
  };
}

const NOW = new Date(2026, 8, 19, 9, 5); // 09:05 local

const getUser = contract({
  kind: "function",
  symbol: "getUser",
  signature: "getUser(id: string) -> Promise<User>",
  shape: { user_id: "string", full_name: "string" },
  deps: ["axios@1.7.2"],
});

describe("renderContext", () => {
  it("renders the header with repo, branch, and HH:MM", () => {
    const out = renderContext({ repo: "acme/widgets", branch: "feat/user-api", contracts: [getUser], now: NOW });
    expect(out.startsWith("Handshake — repo acme/widgets, branch feat/user-api, as of 09:05.")).toBe(true);
  });

  it("inlines a function's return shape as names and types", () => {
    const out = renderContext({ repo: "acme/widgets", branch: "feat/user-api", contracts: [getUser], now: NOW });
    expect(out).toContain("- getUser(id: string) -> { user_id: string, full_name: string }");
    expect(out).toContain("  owner dev-a, branch feat/user-api, status declared.");
  });

  it("derives conventions: dominant functional class and casing", () => {
    const contracts = [
      getUser,
      contract({ kind: "dependency", symbol: "axios", deps: ["axios"] }),
      contract({ kind: "type", symbol: "Order", shape: { order_id: "string", line_total: "number" } }),
    ];
    const out = renderContext({ repo: "acme/widgets", branch: "feat/user-api", contracts, now: NOW });
    expect(out).toContain("Conventions in force on this repo:");
    expect(out).toContain("- HTTP client is axios.");
    expect(out).toContain("- Object fields are snake_case.");
  });

  it("only lists function, type, and route contracts as consumable", () => {
    const contracts = [
      contract({ kind: "route", symbol: "GET /users" }),
      contract({ kind: "env", symbol: "DATABASE_URL" }),
      contract({ kind: "dependency", symbol: "axios", deps: ["axios"] }),
    ];
    const out = renderContext({ repo: "acme/widgets", branch: "feat/user-api", contracts, now: NOW });
    expect(out).toContain("- GET /users");
    expect(out).not.toContain("DATABASE_URL");
  });

  it("always prints reporting branches, and reads 'none' when empty", () => {
    const out = renderContext({ repo: "acme/widgets", branch: "feat/user-api", contracts: [], now: NOW });
    expect(out).toContain("Reporting branches: none. Others may exist but are not reporting.");
    expect(out).not.toContain("Contracts this branch can consume:");
  });

  it("lists each reporting branch with its owner", () => {
    const contracts = [
      getUser,
      contract({ kind: "function", symbol: "listOrders", branch: "feat/orders", owner: "dev-b", signature: "listOrders() -> Order[]" }),
    ];
    const out = renderContext({ repo: "acme/widgets", branch: "feat/user-api", contracts, now: NOW });
    expect(out).toContain("Reporting branches: feat/user-api (dev-a), feat/orders (dev-b). Others may exist but are not reporting.");
  });

  it("stays within the token budget by dropping sections, keeping header and reporting", () => {
    const many = Array.from({ length: 80 }, (_, i) =>
      contract({
        kind: "function",
        symbol: `fn${i}`,
        signature: `fn${i}(argumentNumberOne: string, argumentNumberTwo: number) -> Promise<SomeReasonablyLongReturnTypeName>`,
        branch: `feat/branch-${i}`,
        owner: `dev-${i}`,
        deps: ["axios@1.7.2"],
      }),
    );
    const out = renderContext({ repo: "acme/widgets", branch: "feat/user-api", contracts: many, now: NOW });
    expect(Math.ceil(out.length / 4)).toBeLessThanOrEqual(600);
    expect(out).toContain("Handshake — repo acme/widgets");
    expect(out).toContain("Reporting branches:");
    // Conventions are the first casualty of the budget.
    expect(out).not.toContain("Conventions in force on this repo:");
  });
});
