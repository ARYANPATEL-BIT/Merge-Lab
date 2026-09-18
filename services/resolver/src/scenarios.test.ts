import { describe, expect, it } from "vitest";
import { runRules } from "./index.js";
import { scenarios } from "../../../fixtures/scenarios.js";

describe("runRules — one scenario per rule", () => {
  for (const s of scenarios) {
    it(`${s.rule}: ${s.name}`, () => {
      expect(runRules(s.incoming, s.active, s.bindings)).toEqual(s.expected);
    });
  }
});
