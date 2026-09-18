import type { Declaration } from "@handshake/shared";
import { describe, expect, it } from "vitest";
import { redact } from "./index.js";

function decl(over: Partial<Declaration>): Declaration {
  return {
    kind: "function",
    symbol: "x",
    provides: [],
    consumes: [],
    deps: [],
    source_ref: "src/api/user.ts:1",
    origin: "working_tree",
    confidence: 1,
    ...over,
  };
}

describe("redact — rule 2: forbidden sources are dropped", () => {
  for (const source_ref of [
    ".env:1",
    "config/.env.local:2",
    "keys/server.pem:1",
    "id_rsa.key:3",
    "secrets/db.ts:4",
  ]) {
    it(`drops ${source_ref}`, () => {
      expect(redact(decl({ source_ref }))).toBeNull();
    });
  }

  it("keeps a normal source", () => {
    expect(redact(decl({ source_ref: "src/api/user.ts:1" }))).not.toBeNull();
  });
});

describe("redact — rule 3: sensitive identifiers are masked", () => {
  it("masks a sensitive symbol", () => {
    expect(redact(decl({ kind: "env", symbol: "API_KEY" }))?.symbol).toBe("<redacted>");
  });

  it("masks sensitive entries in provides", () => {
    expect(redact(decl({ provides: ["getToken", "normal"] }))?.provides).toEqual([
      "<redacted>",
      "normal",
    ]);
  });

  it("masks sensitive shape keys", () => {
    expect(
      redact(decl({ kind: "type", shape: { apiKey: "string", name: "string" } }))?.shape,
    ).toEqual({ "<redacted>": "string", name: "string" });
  });
});

describe("redact — rule 1: literals are widened to their base type", () => {
  it("widens string/number/boolean literal types in a shape", () => {
    expect(
      redact(decl({ kind: "type", shape: { mode: "'dark'", count: "42", flag: "true" } }))?.shape,
    ).toEqual({ mode: "string", count: "number", flag: "boolean" });
  });

  it("widens a string literal inside a signature", () => {
    expect(redact(decl({ signature: "setMode(m: 'dark') -> void" }))?.signature).toBe(
      "setMode(m: string) -> void",
    );
  });
});

describe("redact — rule 4: oversized declarations are dropped", () => {
  it("drops a declaration serialising over 2KB", () => {
    const shape: Record<string, string> = {};
    for (let i = 0; i < 400; i++) shape[`field_${i}`] = "string";
    expect(redact(decl({ kind: "type", shape }))).toBeNull();
  });

  it("keeps a small declaration", () => {
    expect(redact(decl({ kind: "type", shape: { a: "string" } }))).not.toBeNull();
  });
});
