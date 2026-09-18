import type { Declaration } from "@handshake/shared";
import { describe, expect, it } from "vitest";
import { extractManifestDeps } from "./index.js";
import { extractFailed, resetExtractFailed } from "./counter.js";

const OLD = JSON.stringify({
  dependencies: { axios: "1.6.0", lodash: "4.17.21" },
  devDependencies: { vitest: "2.0.0" },
});

const NEW = JSON.stringify({
  dependencies: { axios: "1.7.2", lodash: "4.17.21", express: "4.19.2" },
  devDependencies: { vitest: "2.0.0" },
});

describe("extractManifestDeps", () => {
  it("emits declarations only for added or changed deps", () => {
    expect(extractManifestDeps(OLD, NEW)).toEqual<Declaration[]>([
      {
        kind: "dependency",
        symbol: "axios",
        provides: [],
        consumes: [],
        deps: ["axios@1.7.2"],
        source_ref: "package.json",
        origin: "working_tree",
        confidence: 1,
      },
      {
        kind: "dependency",
        symbol: "express",
        provides: [],
        consumes: [],
        deps: ["express@4.19.2"],
        source_ref: "package.json",
        origin: "working_tree",
        confidence: 1,
      },
    ]);
  });

  it("returns [] when nothing changed", () => {
    expect(extractManifestDeps(NEW, NEW)).toEqual([]);
  });

  it("returns [] and bumps extractFailed on malformed JSON", () => {
    resetExtractFailed();
    expect(extractManifestDeps("{ not json", "{}")).toEqual([]);
    expect(extractFailed).toBe(1);
  });
});
