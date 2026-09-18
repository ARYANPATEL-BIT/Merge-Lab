import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Declaration } from "@handshake/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { typescriptExtractor } from "./index.js";
import { extractFailed, resetExtractFailed } from "./counter.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");

function extractFixture(rel: string): Declaration[] {
  return typescriptExtractor.extract(rel, readFileSync(resolve(root, rel), "utf8"));
}

const userShape = {
  user_id: "string",
  full_name: "string",
  created_at: "string",
};

describe("typescriptExtractor — repo-a/types.ts", () => {
  it("extracts the User type; it provides itself and consumes nothing", () => {
    expect(extractFixture("fixtures/repo-a/types.ts")).toEqual([
      {
        kind: "type",
        symbol: "User",
        provides: ["User"],
        consumes: [],
        deps: [],
        source_ref: "fixtures/repo-a/types.ts:1",
        origin: "working_tree",
        confidence: 1,
        shape: userShape,
      },
    ]);
  });
});

describe("typescriptExtractor — repo-a/user.ts", () => {
  it("per-declaration provides/consumes; getUser inlines User across files", () => {
    expect(extractFixture("fixtures/repo-a/user.ts")).toEqual([
      {
        kind: "dependency",
        symbol: "axios",
        provides: [],
        consumes: [],
        deps: ["axios"],
        source_ref: "fixtures/repo-a/user.ts:1",
        origin: "working_tree",
        confidence: 1,
      },
      {
        kind: "function",
        symbol: "getUser",
        provides: ["getUser"],
        consumes: ["axios", "User", "DATABASE_URL"],
        deps: [],
        source_ref: "fixtures/repo-a/user.ts:4",
        origin: "working_tree",
        confidence: 1,
        signature: "getUser(id: string) -> Promise<User>",
        shape: userShape,
      },
      {
        kind: "env",
        symbol: "DATABASE_URL",
        provides: ["DATABASE_URL"],
        consumes: [],
        deps: [],
        source_ref: "fixtures/repo-a/user.ts:5",
        origin: "working_tree",
        confidence: 1,
      },
    ]);
  });
});

describe("typescriptExtractor — repo-a/routes.ts", () => {
  it("routes provide their own symbol and consume only what the handler references", () => {
    expect(extractFixture("fixtures/repo-a/routes.ts")).toEqual([
      {
        kind: "dependency",
        symbol: "express",
        provides: [],
        consumes: [],
        deps: ["express"],
        source_ref: "fixtures/repo-a/routes.ts:1",
        origin: "working_tree",
        confidence: 1,
      },
      {
        kind: "route",
        symbol: "GET /api/users/:id",
        provides: ["GET /api/users/:id"],
        consumes: ["getUser"],
        deps: [],
        source_ref: "fixtures/repo-a/routes.ts:6",
        origin: "working_tree",
        confidence: 1,
      },
      {
        kind: "route",
        symbol: "POST /api/users",
        provides: ["POST /api/users"],
        consumes: [],
        deps: [],
        source_ref: "fixtures/repo-a/routes.ts:10",
        origin: "working_tree",
        confidence: 1,
      },
    ]);
  });
});

describe("typescriptExtractor — repo-b/profile.ts", () => {
  it("consumes getUser by symbol; Promise<void> inlines no shape", () => {
    expect(extractFixture("fixtures/repo-b/profile.ts")).toEqual([
      {
        kind: "dependency",
        symbol: "axios",
        provides: [],
        consumes: [],
        deps: ["axios"],
        source_ref: "fixtures/repo-b/profile.ts:1",
        origin: "working_tree",
        confidence: 1,
      },
      {
        kind: "function",
        symbol: "loadProfile",
        provides: ["loadProfile"],
        consumes: ["axios", "getUser"],
        deps: [],
        source_ref: "fixtures/repo-b/profile.ts:4",
        origin: "working_tree",
        confidence: 1,
        signature: "loadProfile(id: string) -> Promise<void>",
      },
    ]);
  });
});

describe("typescriptExtractor — failure handling", () => {
  beforeEach(() => resetExtractFailed());

  it("returns [] and bumps extractFailed on a syntax error", () => {
    expect(extractFixture("fixtures/repo-a/broken.ts")).toEqual([]);
    expect(extractFailed).toBe(1);
  });
});
