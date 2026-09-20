// Build-time stats generator for the landing page. Computes the three figures
// the "By the numbers" section would otherwise hardcode - packages & services,
// passing tests, deterministic rules - from the repo itself, so they can never
// drift from reality on the next commit.
//
// Each figure is computed independently and defensively: any figure that cannot
// be established is written as null, and the landing page renders WITHOUT that
// number rather than with a wrong one. The script always exits 0 so a stats
// failure never breaks the board build.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const outDir = resolve(here, "..", "src", "generated");
const outFile = join(outDir, "stats.json");

/** Number of workspace projects declared in pnpm-workspace.yaml. */
function countPackages() {
  const yaml = readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8");
  // Grab the `- <glob>` entries under the `packages:` key.
  const globs = [];
  let inPackages = false;
  for (const line of yaml.split(/\r?\n/)) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const m = line.match(/^\s*-\s*['"]?([^'"\s]+)['"]?\s*$/);
      if (m) globs.push(m[1]);
      else if (line.trim() !== "" && !/^\s/.test(line)) break; // next top-level key
    }
  }
  if (globs.length === 0) throw new Error("no workspace globs found");

  let count = 0;
  for (const glob of globs) {
    if (glob.endsWith("/*")) {
      const base = join(repoRoot, glob.slice(0, -2));
      if (!existsSync(base)) continue;
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (entry.isDirectory() && existsSync(join(base, entry.name, "package.json"))) count++;
      }
    } else {
      if (existsSync(join(repoRoot, glob, "package.json"))) count++;
    }
  }
  if (count === 0) throw new Error("no workspace packages found");
  return count;
}

/** Real passing-test count from a full `vitest run`. Throws if any test fails
 *  (non-zero exit), so a broken suite yields null, never a stale number. */
function countPassingTests() {
  const raw = execFileSync("pnpm", ["-s", "exec", "vitest", "run"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32", // pnpm is a .cmd on Windows
  });
  const clean = raw.replace(/\[[0-9;]*m/g, "");
  const m = clean.match(/Tests\s+(\d+)\s+passed/);
  if (!m) throw new Error("could not parse vitest summary");
  return Number(m[1]);
}

/** Deterministic rule count: RuleId members that the resolver's rule engine
 *  actually emits. Counting the enum alone would include SEMANTIC_DUPLICATE,
 *  which is the inferred Bedrock advisory - not a deterministic rule - so the
 *  "deterministic rules" figure must exclude it. */
function countDeterministicRules() {
  const shared = readFileSync(
    join(repoRoot, "packages", "shared", "src", "index.ts"),
    "utf8",
  );
  const enumBlock = shared.match(/RuleIdSchema\s*=\s*z\.enum\(\[([\s\S]*?)\]\)/);
  if (!enumBlock) throw new Error("RuleIdSchema enum not found");
  const members = [...enumBlock[1].matchAll(/["']([A-Z_]+)["']/g)].map((x) => x[1]);
  if (members.length === 0) throw new Error("no RuleId members found");

  const rules = readFileSync(
    join(repoRoot, "services", "resolver", "src", "rules.ts"),
    "utf8",
  );
  const emitted = new Set(
    [...rules.matchAll(/rule:\s*["']([A-Z_]+)["']/g)].map((x) => x[1]),
  );
  const deterministic = members.filter((id) => emitted.has(id));
  if (deterministic.length === 0) throw new Error("no deterministic rules emitted");
  return deterministic.length;
}

function safely(fn, label) {
  try {
    return fn();
  } catch (err) {
    console.warn(`[gen-stats] could not compute ${label}: ${err.message}`);
    return null;
  }
}

const stats = {
  packages: safely(countPackages, "packages"),
  tests: safely(countPassingTests, "tests"),
  rules: safely(countDeterministicRules, "rules"),
  generatedAt: new Date().toISOString(),
};

try {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify(stats, null, 2) + "\n");
  console.log(
    `[gen-stats] wrote ${outFile}: ${stats.packages ?? "-"} packages, ` +
      `${stats.tests ?? "-"} tests, ${stats.rules ?? "-"} rules`,
  );
} catch (err) {
  // Never fail the build over stats. The committed stats.json stays as the last
  // good value, and any null figure is simply omitted by the landing page.
  console.warn(`[gen-stats] could not write ${outFile}: ${err.message}`);
}

process.exit(0);
