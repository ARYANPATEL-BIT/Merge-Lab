// Unit tests for the workspace token resolution shared by every handler. The
// ordering here is what keeps the legacy CLI/hooks path (and the "no DynamoDB
// on a wrong token" handler tests) working, so it is pinned explicitly.

import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WORKSPACE_ID,
  WORKSPACE_TOKEN_PREFIX,
  contractInWorkspace,
  generateJoinCode,
  generateWorkspaceToken,
  hashToken,
  resolveWorkspaceContext,
  type Contract,
} from "./index.js";

const LEGACY = "s3cr3t";

function contract(over: Partial<Contract>): Contract {
  return {
    kind: "type",
    symbol: "User",
    provides: [],
    consumes: [],
    deps: [],
    source_ref: "src/user.ts:1",
    origin: "working_tree",
    confidence: 1,
    contract_id: "ct_1",
    repo: "acme/app",
    branch: "main",
    owner: "dev-a",
    version: 1,
    status: "declared",
    declared_at: "2026-09-20T00:00:00Z",
    ...over,
  };
}

describe("resolveWorkspaceContext", () => {
  it("returns null and never looks up when the header is missing", async () => {
    const lookup = vi.fn();
    expect(await resolveWorkspaceContext(undefined, LEGACY, lookup)).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("maps the legacy static token to the default workspace with no lookup", async () => {
    const lookup = vi.fn();
    const ctx = await resolveWorkspaceContext(`Bearer ${LEGACY}`, LEGACY, lookup);
    expect(ctx).toEqual({ workspace_id: DEFAULT_WORKSPACE_ID, role: "owner", user_id: "legacy" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects a non-workspace token without any lookup", async () => {
    const lookup = vi.fn();
    expect(await resolveWorkspaceContext("Bearer wrong", LEGACY, lookup)).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("resolves a workspace token via the lookup row", async () => {
    const token = generateWorkspaceToken();
    const lookup = vi.fn(async (hash: string) => {
      expect(hash).toBe(hashToken(token));
      return { workspace_id: "ws_abc", role: "member", user_id: "usr_1" };
    });
    const ctx = await resolveWorkspaceContext(`Bearer ${token}`, LEGACY, lookup);
    expect(ctx).toEqual({ workspace_id: "ws_abc", role: "member", user_id: "usr_1" });
  });

  it("resolves an ml_live_* token and normalizes workspace to workspace_id", async () => {
    const token = "ml_live_f53a5b8d34334472c5224f20e5b9be1a6da529b8bd1205f8";
    const lookup = vi.fn(async (hash: string) => {
      expect(hash).toBe(hashToken(token));
      return { workspace: "aryan", email: "tuhinrock121@gmail.com" };
    });
    const ctx = await resolveWorkspaceContext(`Bearer ${token}`, LEGACY, lookup);
    expect(ctx).toEqual({ workspace_id: "aryan", role: "owner", user_id: "tuhinrock121@gmail.com" });
  });

  it("treats a revoked or missing token row as unauthorized", async () => {
    const token = generateWorkspaceToken();
    expect(
      await resolveWorkspaceContext(`Bearer ${token}`, LEGACY, async () => ({
        workspace_id: "ws_abc",
        role: "owner",
        user_id: "usr_1",
        revoked: true,
      })),
    ).toBeNull();
    expect(await resolveWorkspaceContext(`Bearer ${token}`, LEGACY, async () => undefined)).toBeNull();
  });
});

describe("contractInWorkspace", () => {
  it("treats a contract with no workspace_id as belonging to the default workspace", () => {
    expect(contractInWorkspace(contract({}), DEFAULT_WORKSPACE_ID)).toBe(true);
    expect(contractInWorkspace(contract({}), "ws_abc")).toBe(false);
  });

  it("matches an explicit workspace_id", () => {
    expect(contractInWorkspace(contract({ workspace_id: "ws_abc" }), "ws_abc")).toBe(true);
    expect(contractInWorkspace(contract({ workspace_id: "ws_abc" }), DEFAULT_WORKSPACE_ID)).toBe(false);
  });
});

describe("join code and token shape", () => {
  it("mints a screen-typeable join code with no ambiguous glyphs", () => {
    const code = generateJoinCode(new Uint8Array([0, 1, 2, 3, 4]));
    expect(code).toMatch(/^ML-[A-HJ-NP-Z2-9]{5}$/);
    expect(code).not.toMatch(/[IO01]/);
  });

  it("mints workspace tokens under the reserved prefix", () => {
    expect(generateWorkspaceToken().startsWith(WORKSPACE_TOKEN_PREFIX)).toBe(true);
  });
});
