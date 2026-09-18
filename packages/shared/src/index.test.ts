import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ContractSchema,
  DeclarationSchema,
  shapeHash,
  type Declaration,
} from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, "../../../fixtures/declarations.sample.json");
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown[];

describe("declaration fixtures", () => {
  it("contains 12 entries", () => {
    expect(fixtures).toHaveLength(12);
  });

  it("every fixture validates against ContractSchema", () => {
    for (const f of fixtures) {
      expect(() => ContractSchema.parse(f)).not.toThrow();
    }
  });

  it("every fixture also satisfies DeclarationSchema", () => {
    for (const f of fixtures) {
      expect(() => DeclarationSchema.parse(f)).not.toThrow();
    }
  });
});

describe("shapeHash", () => {
  const base: Declaration = {
    kind: "type",
    symbol: "User",
    shape: { user_id: "string", full_name: "string", created_at: "string" },
    provides: ["User"],
    consumes: [],
    deps: [],
    source_ref: "src/api/types.ts:3",
    origin: "working_tree",
    confidence: 0.98,
  };

  it("is stable when top-level and shape keys are reordered", () => {
    const reordered: Declaration = {
      confidence: 0.98,
      origin: "working_tree",
      source_ref: "src/api/types.ts:3",
      deps: [],
      consumes: [],
      provides: ["User"],
      shape: { created_at: "string", user_id: "string", full_name: "string" },
      symbol: "User",
      kind: "type",
    };
    expect(shapeHash(reordered)).toBe(shapeHash(base));
  });

  it("ignores source_ref and declared_at", () => {
    const movedRef: Declaration = { ...base, source_ref: "other/file.ts:999" };
    expect(shapeHash(movedRef)).toBe(shapeHash(base));

    const withDeclaredAt = {
      ...base,
      declared_at: "2026-01-01T00:00:00Z",
    } as Declaration;
    expect(shapeHash(withDeclaredAt)).toBe(shapeHash(base));
  });

  it("changes when a field type changes", () => {
    const changed: Declaration = {
      ...base,
      shape: { ...base.shape, user_id: "number" },
    };
    expect(shapeHash(changed)).not.toBe(shapeHash(base));
  });
});
