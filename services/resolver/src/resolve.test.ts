import type { Contract, Declaration } from "@mergelab/shared";
import { describe, expect, it } from "vitest";
import { resolve } from "./index.js";

function decl(over: Partial<Declaration> & Pick<Declaration, "symbol">): Declaration {
  return {
    kind: "type",
    provides: [over.symbol],
    consumes: [],
    deps: [],
    source_ref: "src/user.ts:1",
    origin: "working_tree",
    confidence: 1,
    ...over,
  };
}

function asContract(d: Declaration, over: Partial<Contract> & Pick<Contract, "contract_id">): Contract {
  return {
    ...d,
    repo: "acme/app",
    owner: "dev-a",
    branch: "feat/user-api",
    version: 1,
    status: "declared",
    declared_at: "2026-09-18T09:00:00Z",
    ...over,
  };
}

describe("resolve", () => {
  it("is a no-op on an identical republish (same shapeHash)", () => {
    const d = decl({ symbol: "User", shape: { user_id: "string" } });
    // A prior contract whose declaration portion is byte-identical to d.
    const prior = [asContract(d, { contract_id: "ct_user_v1" })];

    const result = resolve([d], prior);

    expect(result.superseded).toEqual([]);
    expect(result.resolutions).toHaveLength(1);
    expect(result.resolutions[0]).toMatchObject({
      action: "unchanged",
      version: 1,
      status: "declared",
      prior: { contract_id: "ct_user_v1" },
    });
    expect(result.resolutions[0].supersedes).toBeUndefined();
  });

  it("ignores incidental source_ref differences when hashing", () => {
    const prior = [
      asContract(decl({ symbol: "User", shape: { user_id: "string" }, source_ref: "src/api/user.ts:14" }), {
        contract_id: "ct_user_v1",
      }),
    ];
    const republish = decl({ symbol: "User", shape: { user_id: "string" }, source_ref: "src/user.ts:99" });

    expect(resolve([republish], prior).resolutions[0].action).toBe("unchanged");
  });

  it("versions and supersedes when the shape changes", () => {
    const prior = [
      asContract(decl({ symbol: "User", shape: { user_id: "string" } }), { contract_id: "ct_user_v1", version: 1 }),
    ];
    const changed = decl({ symbol: "User", shape: { user_id: "string", email: "string" } });

    const result = resolve([changed], prior);

    expect(result.resolutions[0]).toMatchObject({
      action: "superseding",
      version: 2,
      status: "declared",
      supersedes: "ct_user_v1",
    });
    expect(result.superseded).toEqual([
      expect.objectContaining({ contract_id: "ct_user_v1", status: "changed" }),
    ]);
  });

  it("declares a brand-new symbol at version 1", () => {
    const result = resolve([decl({ symbol: "Brand", shape: { name: "string" } })], []);

    expect(result.superseded).toEqual([]);
    expect(result.resolutions[0]).toMatchObject({
      action: "declared",
      version: 1,
      status: "declared",
    });
    expect(result.resolutions[0].prior).toBeUndefined();
  });

  it("supersedes the highest active version and skips already-changed contracts", () => {
    const prior = [
      asContract(decl({ symbol: "User", shape: { user_id: "string" } }), {
        contract_id: "ct_user_v1",
        version: 1,
        status: "changed",
      }),
      asContract(decl({ symbol: "User", shape: { user_id: "string", full_name: "string" } }), {
        contract_id: "ct_user_v2",
        version: 2,
        status: "declared",
      }),
    ];
    const next = decl({ symbol: "User", shape: { user_id: "string", full_name: "string", created_at: "string" } });

    const result = resolve([next], prior);

    expect(result.resolutions[0]).toMatchObject({
      action: "superseding",
      version: 3,
      supersedes: "ct_user_v2",
    });
  });
});
