// Landing-page content. Every string here is true of the repo as it stands:
// the rule ids and reason strings are the real output of services/resolver's
// rule engine (rules.ts) on the bundled demo dataset; the context block is the
// verbatim output of packages/daemon/src/render.ts for that dataset; the
// numbers are counted from the repo. No invented statistics, no placeholders.

import type { RuleId, Severity } from "@mergelab/shared";
import generatedStats from "../generated/stats.json";

export const GITHUB_URL = "https://github.com/ARYANPATEL-BIT/Merge-Lab";
export const DOCS_URL = "https://github.com/ARYANPATEL-BIT/Merge-Lab/blob/main/README.md";

/** The six deterministic rules, with the actual linter-style reason strings the
 *  engine emits. Rules 1/2/3/6 are the exact messages produced for the demo
 *  dataset; ROUTE_COLLISION and SHAPE_MISMATCH do not fire on the demo, so their
 *  reasons are the engine's own templates instantiated with the demo symbols. */
export interface RuleRow {
  id: RuleId;
  severity: Severity;
  reason: string;
}

export const RULES: RuleRow[] = [
  {
    id: "DEP_CONFLICT",
    severity: "block",
    reason:
      "This repo uses axios for HTTP (dev-a, feat/user-api). Adding node-fetch means two HTTP clients.",
  },
  {
    id: "NAMING_DRIFT",
    severity: "block",
    reason:
      "Field userId drifts from user_id in User (declared by dev-a on feat/user-api); match the existing casing.",
  },
  {
    id: "DUP_SYMBOL",
    severity: "warn",
    reason:
      "getUser is already declared by dev-a on feat/user-api; pick a different name or coordinate.",
  },
  {
    id: "ROUTE_COLLISION",
    severity: "block",
    reason:
      "Route POST /api/users is already declared by dev-a on feat/user-api; two handlers would collide.",
  },
  {
    id: "SHAPE_MISMATCH",
    severity: "block",
    reason:
      "User.email does not exist on the User shape declared by dev-a on feat/user-api.",
  },
  {
    id: "STALE_BINDING",
    severity: "notify",
    reason:
      "You are pinned to User v1 but dev-a has published v2 on feat/user-api.",
  },
];

/** The three-step pipeline shown in the inverted dark section. */
export interface Step {
  n: string;
  name: string;
  where: string;
  body: string;
}

export const STEPS: Step[] = [
  {
    n: "01",
    name: "Declare",
    where: "your working tree",
    body: "The CLI walks your working tree with ts-morph - uncommitted edits included - and publishes exported signatures, data shapes, deps, routes and env var names. Names and types only.",
  },
  {
    n: "02",
    name: "Inject",
    where: "SessionStart",
    body: "A SessionStart hook fetches the contracts your branch can consume and renders them into your teammate's agent context, as plain factual statements - never source code, never instructions.",
  },
  {
    n: "03",
    name: "Block",
    where: "PreToolUse",
    body: "A PreToolUse hook extracts declarations from the proposed write, asks the registry for a deterministic verdict, and denies the write when it drifts. Fails open past a 300ms budget.",
  },
];

/** Numbered capability rows. */
export interface Capability {
  n: string;
  title: string;
  body: string;
}

export const CAPABILITIES: Capability[] = [
  {
    n: "01",
    title: "Working-tree extraction",
    body: "A ts-morph walk reads the tree as it is right now - staged, unstaged and untracked source files alike. The decision you made five minutes ago is publishable before it is committed, let alone pushed.",
  },
  {
    n: "02",
    title: "Deterministic drift rules",
    body: "Six pure rules over declarations and contracts decide allow, warn or block. No model sits in the enforcement path - the same inputs always produce the same verdict, and the reason is a plain string you can read.",
  },
  {
    n: "03",
    title: "Context injection across agents",
    body: "One developer's declarations become another's context at SessionStart. Your teammate's agent starts the session already knowing the User shape you settled on, the route you claimed and the HTTP client the repo uses.",
  },
  {
    n: "04",
    title: "Declarations only",
    body: "The wire carries names and types - never file contents, never diffs, never literal values, never secrets. Extraction failure returns an empty set and increments a counter rather than guessing.",
  },
];

/** Verified counts. Do not add numbers that are not true of the repo. */
export interface Stat {
  value: string;
  label: string;
}

// The first three figures are generated at build time by scripts/gen-stats.mjs
// (counting workspace packages, the real passing-test count, and the
// deterministic RuleId members). Any figure the generator could not establish
// is null and is omitted here, so the page renders without a number rather than
// with a stale or wrong one. The last two are invariants, not counts.
const COMPUTED: (Stat | null)[] = [
  generatedStats.packages != null
    ? { value: String(generatedStats.packages), label: "packages & services" }
    : null,
  generatedStats.tests != null
    ? { value: String(generatedStats.tests), label: "passing tests" }
    : null,
  generatedStats.rules != null
    ? { value: String(generatedStats.rules), label: "deterministic rules" }
    : null,
];

export const STATS: Stat[] = [
  ...COMPUTED.filter((s): s is Stat => s !== null),
  { value: "300ms", label: "verdict budget" },
  { value: "0", label: "bytes of source code sent" },
];

/** The AWS services provisioned by infra/template.yaml. */
export interface AwsService {
  name: string;
  role: string;
}

export const AWS_SERVICES: AwsService[] = [
  { name: "AWS Lambda", role: "Ingest, context, verdict, board, auth and semantic handlers" },
  { name: "API Gateway", role: "One HTTP API in front of the functions" },
  { name: "DynamoDB", role: "Single-table contract registry and semantic cache" },
  { name: "Amazon Bedrock", role: "Claude 3 Haiku for async semantic duplicate analysis" },
  { name: "AWS SAM", role: "Infrastructure as code, region ap-south-1" },
];

/** Verbatim output of renderContext() (packages/daemon/src/render.ts) for the
 *  demo dataset, as seen by feat/profile-ui (dev-b) at SessionStart. This is the
 *  real rendered block - the header keeps the internal "Merge Lab" wordmark the
 *  binary still prints. */
export const CONTEXT_BLOCK = `Merge Lab - repo acme/app, branch feat/profile-ui, as of 09:41.

Contracts this branch can consume:
- User { user_id: string, full_name: string, created_at: string }
  owner dev-a, branch feat/user-api, status implemented.
- getUser(id: string) -> Promise<User>
  owner dev-a, branch feat/user-api, status implemented.
- POST /api/users
  owner dev-a, branch feat/user-api, status declared.
- searchUsers(q: string) -> Promise<User[]>
  owner dev-c, branch feat/search, status implementing.
- GET /api/search
  owner dev-c, branch feat/search, status declared.

Conventions in force on this repo:
- HTTP client is axios.
- Object fields are snake_case.

Reporting branches: feat/user-api (dev-a), feat/search (dev-c). Others may exist but are not reporting.`;
