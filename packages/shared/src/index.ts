// @mergelab/shared - canonical contract types, single source of truth.
// P1-owned. Everyone (extractor, daemon, hooks, ingest, context, verdict)
// imports from here so every tier validates against the exact same objects.
//
// zod schemas are authoritative; TypeScript types are inferred from them.
// Hard rule: declarations carry names and types only - never source code,
// diffs, or literal values.

import { createHash, randomBytes } from "node:crypto";
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
  /**
   * Workspace that owns this contract. Optional and additive: rows written
   * before workspaces existed (and rows written with the legacy static token)
   * carry no workspace_id and are treated as the DEFAULT_WORKSPACE_ID.
   */
  workspace_id: z.string().optional(),
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
  "SEMANTIC_DUPLICATE",
]);
export type RuleId = z.infer<typeof RuleIdSchema>;

export const SeveritySchema = z.enum(["block", "warn", "notify"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const FindingOriginSchema = z.enum(["deterministic", "inferred"]);
export type FindingOrigin = z.infer<typeof FindingOriginSchema>;

export const FindingSchema = z.object({
  rule: RuleIdSchema,
  severity: SeveritySchema,
  reason: z.string(),
  contract_ids: z.array(z.string()),
  origin: FindingOriginSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

/** Output shape returned by Bedrock semantic duplicate analysis. */
export const SemanticComparisonResultSchema = z.object({
  duplicate: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});
export type SemanticComparisonResult = z.infer<
  typeof SemanticComparisonResultSchema
>;

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

// ---- Workspaces -----------------------------------------------------------
// Workspace scoping is ADDITIVE on top of the legacy static bearer token.
// A workspace token maps to exactly one workspace; the legacy MERGELAB_TOKEN
// maps to DEFAULT_WORKSPACE_ID so the CLI and hooks keep working unchanged.

/** The workspace legacy-token callers (CLI, hooks, demo) resolve to. */
export const DEFAULT_WORKSPACE_ID = "default";

/** Every minted workspace token starts with this. Never the legacy token. */
export const WORKSPACE_TOKEN_PREFIX = "ml_ws_";
export const LIVE_TOKEN_PREFIX = "ml_live_";

/** Roles within a workspace. Owners can approve joins and mint/revoke tokens. */
export const WorkspaceRoleSchema = z.enum(["owner", "member"]);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

export const JoinRequestStatusSchema = z.enum(["pending", "approved", "denied"]);
export type JoinRequestStatus = z.infer<typeof JoinRequestStatusSchema>;

/**
 * Stored, hashed representation of a workspace token. We persist SHA-256 of the
 * token, never the token itself; the plaintext is shown to a human exactly once
 * at mint time. The legacy MERGELAB_TOKEN is exempt (resolved without a lookup).
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1

/**
 * A short, screen-typeable join code like `ML-7K2QX`. Ambiguous glyphs are
 * excluded so it survives being read off a projector. Not a secret: it only
 * lets someone request to join; an owner still approves.
 */
export function generateJoinCode(bytes?: Uint8Array): string {
  const raw = bytes ?? randomBytes(5);
  let body = "";
  for (let i = 0; i < 5; i++) body += JOIN_CODE_ALPHABET[raw[i] % JOIN_CODE_ALPHABET.length];
  return `ML-${body}`;
}

export const WorkspaceSchema = z.object({
  workspace_id: z.string(),
  name: z.string(),
  slug: z.string(),
  owner_user_id: z.string(),
  join_code: z.string(),
  created_at: z.string(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const MemberSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  role: WorkspaceRoleSchema,
  joined_at: z.string(),
});
export type Member = z.infer<typeof MemberSchema>;

export const JoinRequestSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  requested_at: z.string(),
  status: JoinRequestStatusSchema,
});
export type JoinRequest = z.infer<typeof JoinRequestSchema>;

/** A token's public metadata. The plaintext token is never included here. */
export const WorkspaceTokenSummarySchema = z.object({
  hash: z.string(),
  label: z.string(),
  created_at: z.string(),
  revoked: z.boolean(),
});
export type WorkspaceTokenSummary = z.infer<typeof WorkspaceTokenSummarySchema>;

// ---- Workspace API request/response schemas -------------------------------

/** POST /v1/workspaces - bootstrap a workspace; caller becomes owner. */
export const CreateWorkspaceRequestSchema = z.object({
  name: z.string().min(1, "Workspace name is required"),
  display_name: z.string().min(1, "Your display name is required"),
});
export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequestSchema>;

/** Returned once at creation: includes the owner token in plaintext. */
export const CreateWorkspaceResponseSchema = z.object({
  workspace: WorkspaceSchema,
  token: z.string(),
});
export type CreateWorkspaceResponse = z.infer<typeof CreateWorkspaceResponseSchema>;

/** A workspace as it appears in a list: identity plus rollup counts. */
export const WorkspaceSummarySchema = WorkspaceSchema.extend({
  member_count: z.number().int(),
  repo_count: z.number().int(),
});
export type WorkspaceSummary = z.infer<typeof WorkspaceSummarySchema>;

export const ListWorkspacesResponseSchema = z.object({
  workspaces: z.array(WorkspaceSummarySchema),
});
export type ListWorkspacesResponse = z.infer<typeof ListWorkspacesResponseSchema>;

export const WorkspaceDetailResponseSchema = z.object({
  workspace: WorkspaceSchema,
  members: z.array(MemberSchema),
  pending_requests: z.array(JoinRequestSchema),
  repos: z.array(z.string()),
  tokens: z.array(WorkspaceTokenSummarySchema),
});
export type WorkspaceDetailResponse = z.infer<typeof WorkspaceDetailResponseSchema>;

/** POST /v1/workspaces/join - request to join by code, identified by name. */
export const JoinWorkspaceRequestSchema = z.object({
  join_code: z.string().min(1, "Join code is required"),
  display_name: z.string().min(1, "Your display name is required"),
});
export type JoinWorkspaceRequest = z.infer<typeof JoinWorkspaceRequestSchema>;

export const JoinWorkspaceResponseSchema = z.object({
  workspace_id: z.string(),
  workspace_name: z.string(),
  request: JoinRequestSchema,
});
export type JoinWorkspaceResponse = z.infer<typeof JoinWorkspaceResponseSchema>;

/** POST /v1/workspaces/:id/tokens - owner mints a labelled token. */
export const MintTokenRequestSchema = z.object({
  label: z.string().min(1, "A label is required"),
});
export type MintTokenRequest = z.infer<typeof MintTokenRequestSchema>;

/** Returned once at mint/approve: plaintext token plus its summary. */
export const MintTokenResponseSchema = z.object({
  token: z.string(),
  summary: WorkspaceTokenSummarySchema,
});
export type MintTokenResponse = z.infer<typeof MintTokenResponseSchema>;

// ---- Workspace token resolution (shared by every handler) -----------------

/** A caller's resolved workspace identity, derived from their bearer token. */
export interface WorkspaceContext {
  workspace_id: string;
  role: WorkspaceRole;
  /** The requester's user_id, or "legacy" for the static-token caller. */
  user_id: string;
}

/** The global TOKEN#<hash>/WORKSPACE lookup row that resolves token -> workspace. */
export const WorkspaceTokenRowSchema = z
  .object({
    workspace_id: z.string().optional(),
    workspace: z.string().optional(),
    role: WorkspaceRoleSchema.optional().default("owner"),
    user_id: z.string().optional(),
    email: z.string().optional(),
    revoked: z.boolean().optional(),
  })
  .transform((data) => {
    const ws = data.workspace_id || data.workspace;
    if (!ws) throw new Error("Missing workspace_id or workspace");
    return {
      workspace_id: ws,
      role: data.role || "owner",
      user_id: data.user_id || data.email || "user",
      revoked: Boolean(data.revoked),
    };
  });
export type WorkspaceTokenRow = z.infer<typeof WorkspaceTokenRowSchema>;

/** Mint a fresh workspace token. Plaintext is shown once; only its hash is stored. */
export function generateWorkspaceToken(): string {
  return `${WORKSPACE_TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;
}

/**
 * Resolve which workspace a bearer token belongs to. The ordering is shared by
 * every handler so scoping is identical everywhere:
 *   - missing/malformed Authorization        -> null (unauthorized)
 *   - the legacy static token                -> DEFAULT workspace, owner, NO lookup
 *   - a token without a workspace prefix     -> null, NO lookup
 *   - a workspace token                      -> lookupToken(hash); null if absent/revoked
 * The two NO-lookup branches are what keep the legacy CLI/hooks path - and the
 * existing "no DynamoDB on a wrong token" tests - working unchanged.
 */
export async function resolveWorkspaceContext(
  authorization: string | undefined,
  legacyToken: string | undefined,
  lookupToken: (hash: string, token?: string) => Promise<unknown>,
): Promise<WorkspaceContext | null> {
  if (!authorization || !authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (legacyToken && token === legacyToken) {
    return { workspace_id: DEFAULT_WORKSPACE_ID, role: "owner", user_id: "legacy" };
  }
  const isWorkspaceToken =
    token.startsWith(WORKSPACE_TOKEN_PREFIX) ||
    token.startsWith(LIVE_TOKEN_PREFIX) ||
    token.startsWith("ml_");
  if (!isWorkspaceToken) return null;
  const parsed = WorkspaceTokenRowSchema.safeParse(await lookupToken(hashToken(token), token));
  if (!parsed.success || parsed.data.revoked) return null;
  const { workspace_id, role, user_id } = parsed.data;
  return { workspace_id, role, user_id };
}

/**
 * Whether a contract belongs to the given workspace. A contract with no
 * workspace_id (legacy rows, or rows written with the static token) is treated
 * as belonging to DEFAULT_WORKSPACE_ID, so legacy data stays visible to the
 * legacy caller and invisible to real workspaces.
 */
export function contractInWorkspace(c: Contract, workspaceId: string): boolean {
  return (c.workspace_id ?? DEFAULT_WORKSPACE_ID) === workspaceId;
}

