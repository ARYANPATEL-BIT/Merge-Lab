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

describe("typescriptExtractor — repo-a/user.ts", () => {
  const provides = ["User", "getUser"];
  const consumes = ["axios", "DATABASE_URL"];

  it("extracts dependency, function (with inlined shape), type, and env", () => {
    expect(extractFixture("fixtures/repo-a/user.ts")).toEqual([
      {
        kind: "dependency",
        symbol: "axios",
        provides,
        consumes,
        deps: ["axios"],
        source_ref: "fixtures/repo-a/user.ts:1",
        origin: "working_tree",
        confidence: 1,
      },
      {
        kind: "function",
        symbol: "getUser",
        provides,
        consumes,
        deps: [],
        source_ref: "fixtures/repo-a/user.ts:9",
        origin: "working_tree",
        confidence: 1,
        signature: "getUser(id: string) -> Promise<User>",
        shape: userShape,
      },
      {
        kind: "type",
        symbol: "User",
        provides,
        consumes,
        deps: [],
        source_ref: "fixtures/repo-a/user.ts:3",
        origin: "working_tree",
        confidence: 1,
        shape: userShape,
      },
      {
        kind: "env",
        symbol: "DATABASE_URL",
        provides,
        consumes,
        deps: [],
        source_ref: "fixtures/repo-a/user.ts:10",
        origin: "working_tree",
        confidence: 1,
      },
    ]);
  });
});

describe("typescriptExtractor — repo-a/routes.ts", () => {
  const consumes = ["express", "getUser"];

  it("extracts the express dependency and both routes", () => {
    expect(extractFixture("fixtures/repo-a/routes.ts")).toEqual([
      {
        kind: "dependency",
        symbol: "express",
        provides: [],
        consumes,
        deps: ["express"],
        source_ref: "fixtures/repo-a/routes.ts:1",
        origin: "working_tree",
        confidence: 1,
      },
      {
        kind: "route",
        symbol: "GET /api/users/:id",
        provides: [],
        consumes,
        deps: [],
        source_ref: "fixtures/repo-a/routes.ts:6",
        origin: "working_tree",
        confidence: 1,
      },
      {
        kind: "route",
        symbol: "POST /api/users",
        provides: [],
        consumes,
        deps: [],
        source_ref: "fixtures/repo-a/routes.ts:10",
        origin: "working_tree",
        confidence: 1,
      },
    ]);
  });
});

describe("typescriptExtractor — repo-b/profile.ts", () => {
  it("consumes getUser; Promise<void> return inlines no shape", () => {
    const provides = ["loadProfile"];
    const consumes = ["axios", "getUser"];
    expect(extractFixture("fixtures/repo-b/profile.ts")).toEqual([
      {
        kind: "dependency",
        symbol: "axios",
        provides,
        consumes,
        deps: ["axios"],
        source_ref: "fixtures/repo-b/profile.ts:1",
        origin: "working_tree",
        confidence: 1,
      },
      {
        kind: "function",
        symbol: "loadProfile",
        provides,
        consumes,
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
