// Prints a legible pass/fail table for the rule scenarios. No test-runner noise.
// Run: pnpm --filter @mergelab/resolver run test:scenarios

import type { Finding } from "@mergelab/shared";
import { runRules } from "../src/index.js";
import { scenarios } from "../../../fixtures/scenarios.js";

/** Canonical JSON (sorted keys) so comparison ignores key order. */
function canon(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/** Compact one-cell summary of a finding list, e.g. "block:DEP_CONFLICT". */
function summarize(findings: Finding[]): string {
  return findings.length
    ? findings.map((f) => `${f.severity}:${f.rule}`).join(", ")
    : "(none)";
}

interface Row {
  rule: string;
  scenario: string;
  expected: string;
  actual: string;
  pass: boolean;
}

const rows: Row[] = scenarios.map((s) => {
  const actual = runRules(s.incoming, s.active, s.bindings);
  return {
    rule: s.rule,
    scenario: s.name,
    expected: summarize(s.expected),
    actual: summarize(actual),
    pass: canon(actual) === canon(s.expected),
  };
});

const headers = ["RULE", "SCENARIO", "EXPECTED", "ACTUAL", "RESULT"];
const cells = rows.map((r) => [
  r.rule,
  r.scenario,
  r.expected,
  r.actual,
  r.pass ? "PASS" : "FAIL",
]);

const widths = headers.map((h, i) =>
  Math.max(h.length, ...cells.map((c) => c[i].length)),
);
const line = (cols: string[]): string =>
  cols.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();

const passed = rows.filter((r) => r.pass).length;

console.log("");
console.log("Merge Lab · resolver rule scenarios");
console.log("");
console.log(line(headers));
console.log(widths.map((w) => "-".repeat(w)).join("  "));
for (const c of cells) console.log(line(c));
console.log("");
console.log(`${passed}/${rows.length} passed`);

process.exit(passed === rows.length ? 0 : 1);
