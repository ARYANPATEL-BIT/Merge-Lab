// @mergelab/shared - canonical contract types, single source of truth.
// P1-owned. Everyone (extractor, daemon, hooks, ingest, context, verdict)
// imports from here so every tier validates against the exact same objects.
//
// zod schemas are authoritative; TypeScript types are inferred from them.
// Hard rule: declarations carry names and types only - never source code,
// diffs, or literal values.

import { createHash } from "node:crypto";
import { z } from "zod";

/** Bumped whenever any schema below changes. Wire payloads carry this. */
export const SCHEMA_VERSION = 1;

// ---- Declaration ----------------------------------------------------------

export const DeclarationKindSchema = z.enum([
  "function",
  "type",
  "dependency",
  "route",
  "env",
]);
export type DeclarationKind = z.infer<typeof DeclarationKindSchema>;

export const OriginSchema = z.enum(["working_tree", "session", "manual"]);
export type Origin = z.infer<typeof OriginSchema>;

export const DeclarationSchema = z.object({
  kind: DeclarationKindSchema,
  symbol: z.string(),
  /** e.g. "getUser(id: string) -> Promise<User>". Names and types only. */
  signature: z.string().optional(),
  /** e.g. { user_id: "string", full_name: "string" }. Field name -> type. */
  shape: z.record(z.string()).optional(),
  provides: z.array(z.string()),
  consumes: z.array(z.string()),
  /** e.g. ["axios@1.7.2"]. */
  deps: z.array(z.string()),
  /** e.g. "src/api/user.ts:14". */
  source_ref: z.string(),
  origin: OriginSchema,
  confidence: z.number().min(0).max(1),
});
export type Declaration = z.infer<typeof DeclarationSchema>;

// ---- Contract (Declaration + registry metadata) ---------------------------

export const ContractStatusSchema = z.enum([
  "declared",
  "implementing",
  "implemented",
  "changed",
  "abandoned",
]);
export type ContractStatus = z.infer<typeof ContractStatusSchema>;

export const ContractSchema = DeclarationSchema.extend({
  contract_id: z.string(),
  repo: z.string(),
  branch: z.string(),
  owner: z.string(),
  version: z.number().int(),
  status: ContractStatusSchema,
  /** contract_id this one replaces, if any. */
  supersedes: z.string().optional(),
  declared_at: z.string(),
});
export type Contract = z.infer<typeof ContractSchema>;

// ---- Findings & verdicts --------------------------------------------------

export const RuleIdSchema = z.enum([
  "DEP_CONFLICT",
  "NAMING_DRIFT",
  "DUP_SYMBOL",
  "ROUTE_COLLISION",
  "SHAPE_MISMATCH",
  "STALE_BINDING",
]);
export type RuleId = z.infer<typeof RuleIdSchema>;

export const SeveritySchema = z.enum(["block", "warn", "notify"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const FindingSchema = z.object({
  rule: RuleIdSchema,
  severity: SeveritySchema,
  reason: z.string(),
  contract_ids: z.array(z.string()),
});
export type Finding = z.infer<typeof FindingSchema>;

export const VerdictDecisionSchema = z.enum(["allow", "warn", "block"]);
export type VerdictDecision = z.infer<typeof VerdictDecisionSchema>;

export const VerdictSchema = z.object({
  verdict: VerdictDecisionSchema,
  findings: z.array(FindingSchema),
});
export type Verdict = z.infer<typeof VerdictSchema>;

// ---- Functional classes ---------------------------------------------------

/**
 * Static map of interchangeable dependencies. Two deps in the same class are
 * functionally substitutable; used by the DEP_CONFLICT rule.
 */
export const FUNCTIONAL_CLASSES = {
  http_client: ["axios", "node-fetch", "got", "superagent"],
  orm: ["prisma", "typeorm", "drizzle"],
  test: ["jest", "vitest", "mocha"],
  validation: ["zod", "joi", "yup"],
} as const;
export type FunctionalClass = keyof typeof FUNCTIONAL_CLASSES;

/** Strip a trailing `@version` from a dep string. Scoped names are preserved. */
export function depName(dep: string): string {
  const at = dep.lastIndexOf("@");
  return at > 0 ? dep.slice(0, at) : dep;
}

/** The functional class a dependency belongs to, or undefined if unclassified. */
export function functionalClassOf(dep: string): FunctionalClass | undefined {
  const name = depName(dep);
  for (const cls of Object.keys(FUNCTIONAL_CLASSES) as FunctionalClass[]) {
    if ((FUNCTIONAL_CLASSES[cls] as readonly string[]).includes(name)) {
      return cls;
    }
  }
  return undefined;
}

// ---- shapeHash ------------------------------------------------------------

/** Fields ignored when hashing: identity/provenance, not shape. */
const SHAPE_HASH_OMIT = ["declared_at", "source_ref"] as const;

/** Recursively sort object keys so key order never affects serialization. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = canonicalize(record[key]);
    }
    return out;
  }
  return value;
}

/**
 * Stable content hash of a Declaration's shape. Ignores `declared_at` and
 * `source_ref`. Reordering keys (top-level or within `shape`) hashes equal;
 * changing any field type changes the hash.
 */
export function shapeHash(d: Declaration): string {
  const clone: Record<string, unknown> = { ...d };
  for (const key of SHAPE_HASH_OMIT) delete clone[key];
  const canonical = JSON.stringify(canonicalize(clone));
  return createHash("sha256").update(canonical).digest("hex");
}

// ---- API request/response schemas -----------------------------------------
// Shared so P2 (ingest/context/verdict) validates the same objects the
// daemon and hooks produce.

/** POST /v1/declarations - daemon publishes a working tree's declarations. */
export const PostDeclarationsRequestSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  repo: z.string(),
  branch: z.string(),
  owner: z.string(),
  origin: OriginSchema,
  declarations: z.array(DeclarationSchema),
});
export type PostDeclarationsRequest = z.infer<
  typeof PostDeclarationsRequestSchema
>;

export const PostDeclarationsResponseSchema = z.object({
  contracts: z.array(ContractSchema),
});
export type PostDeclarationsResponse = z.infer<
  typeof PostDeclarationsResponseSchema
>;

/** GET /v1/context - teammate contracts read at SessionStart. */
export const GetContextRequestSchema = z.object({
  repo: z.string(),
  branch: z.string().optional(),
  /** Omit this owner's own contracts from the result. */
  exclude_owner: z.string().optional(),
});
export type GetContextRequest = z.infer<typeof GetContextRequestSchema>;

export const GetContextResponseSchema = z.object({
  contracts: z.array(ContractSchema),
});
export type GetContextResponse = z.infer<typeof GetContextResponseSchema>;

/** POST /v1/verdict - PreToolUse drift check for a pending write. */
export const PostVerdictRequestSchema = z.object({
  repo: z.string(),
  branch: z.string(),
  owner: z.string(),
  declarations: z.array(DeclarationSchema),
});
export type PostVerdictRequest = z.infer<typeof PostVerdictRequestSchema>;

export const PostVerdictResponseSchema = VerdictSchema;
export type PostVerdictResponse = Verdict;

/**
 * GET /v1/board - one-shot snapshot for the projector board. A branch is
 * `active` when it reported within the heartbeat window, else `dormant`.
 * A dormant branch is still returned so absence never reads as "nobody here".
 */
export const BranchStatusSchema = z.enum(["active", "dormant"]);
export type BranchStatus = z.infer<typeof BranchStatusSchema>;

export const BranchSummarySchema = z.object({
  branch: z.string(),
  owner: z.string(),
  contract_count: z.number().int(),
  /** ISO time of this branch's most recent declaration (its heartbeat). */
  last_reported: z.string(),
  status: BranchStatusSchema,
});
export type BranchSummary = z.infer<typeof BranchSummarySchema>;

export const GetBoardResponseSchema = z.object({
  branches: z.array(BranchSummarySchema),
  contracts: z.array(ContractSchema),
  /** Drift findings across branches, newest first. */
  findings: z.array(FindingSchema),
});
export type GetBoardResponse = z.infer<typeof GetBoardResponseSchema>;

/** A branch is active if it reported within this window (ms). */
export const HEARTBEAT_WINDOW_MS = 5 * 60 * 1000;

// ---- Auth & Workspace -----------------------------------------------------

export const SignupRequestSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  workspace: z.string().optional(),
});
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password is required"),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const UserProfileSchema = z.object({
  name: z.string(),
  email: z.string(),
  workspace: z.string(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const AuthResponseSchema = z.object({
  token: z.string(),
  user: UserProfileSchema,
  workspace: z.string(),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

