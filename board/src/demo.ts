// Demo dataset for the board. Timestamps are stamped relative to load time so
// every branch reads ACTIVE — matching a live demo where all three branches are
// actively publishing. The data is seeded to exercise a realistic spread of the
// rule engine: DEP_CONFLICT + NAMING_DRIFT (block), DUP_SYMBOL (warn) and
// STALE_BINDING (notify).
//
// Roles mirror the resolver's scenarios table (fixtures/scenarios.ts):
// feat/user-api (dev-a) is the established provider; feat/profile-ui (dev-b) is
// the incoming branch whose declarations conflict with it. So feat/profile-ui
// reports most recently — the collapse keeps the fresher side, which frames each
// conflict as "...declared by dev-a on feat/user-api" (axios established,
// node-fetch incoming), exactly as the table specifies.
//
// Set VITE_DEMO_DORMANT=1 (or append ?dormant to the URL) to push one branch
// outside the 5-minute heartbeat window and exercise the "not reporting" state.

import type { Contract } from "@handshake/shared";
import type { Binding } from "@handshake/resolver";

const REPO = "acme/app";

/** Branch → seconds since its last publish. All under 5min ⇒ every branch active.
 *  feat/profile-ui (the incoming/consumer branch) reports most recently so its
 *  perspective wins the drift-feed collapse. */
const HEARTBEAT_SECONDS: Record<string, number> = {
  "feat/profile-ui": 8,
  "feat/user-api": 24,
  "feat/search": 52,
};

/** Which branch goes quiet (and how long ago) when the dormant flag is set. */
const DORMANT_BRANCH = "feat/search";
const DORMANT_SECONDS = 47 * 60;

/** Registry binding: feat/search is pinned to User v1 while feat/user-api ships
 *  v2 — the STALE_BINDING (notify) case. */
const BINDINGS: Record<string, Binding[]> = {
  "feat/search": [{ symbol: "User", version: 1 }],
};

/** Contract seeds, minus the fields the builder fills (repo + declared_at). */
type Seed = Omit<Contract, "repo" | "declared_at">;

const SEEDS: Seed[] = [
  // ── feat/user-api (dev-a) — the established provider ─────────────────────────
  {
    contract_id: "ct_ua_user",
    branch: "feat/user-api",
    owner: "dev-a",
    version: 2,
    status: "implemented",
    kind: "type",
    symbol: "User",
    shape: { user_id: "string", full_name: "string", created_at: "string" },
    provides: ["User"],
    consumes: [],
    deps: [],
    source_ref: "src/api/types.ts:3",
    origin: "working_tree",
    confidence: 0.98,
  },
  {
    contract_id: "ct_ua_dep_axios",
    branch: "feat/user-api",
    owner: "dev-a",
    version: 1,
    status: "declared",
    kind: "dependency",
    // The repo's established HTTP client. feat/profile-ui adding node-fetch is
    // the incoming conflict.
    symbol: "axios",
    provides: [],
    consumes: [],
    deps: ["axios@1.7.2"],
    source_ref: "package.json:20",
    origin: "working_tree",
    confidence: 1,
  },
  {
    contract_id: "ct_ua_get_user",
    branch: "feat/user-api",
    owner: "dev-a",
    version: 1,
    status: "implemented",
    kind: "function",
    symbol: "getUser",
    signature: "getUser(id: string) -> Promise<User>",
    provides: ["getUser"],
    consumes: ["User"],
    deps: ["axios@1.7.2"],
    source_ref: "src/api/user.ts:14",
    origin: "working_tree",
    confidence: 0.95,
  },
  {
    contract_id: "ct_ua_route_post_users",
    branch: "feat/user-api",
    owner: "dev-a",
    version: 1,
    status: "declared",
    kind: "route",
    symbol: "POST /api/users",
    signature: "POST /api/users (body: NewUser) -> User",
    provides: ["POST /api/users"],
    consumes: ["User"],
    deps: [],
    source_ref: "src/api/routes.ts:22",
    origin: "working_tree",
    confidence: 0.9,
  },
  {
    contract_id: "ct_ua_env_db",
    branch: "feat/user-api",
    owner: "dev-a",
    version: 1,
    status: "declared",
    kind: "env",
    symbol: "DATABASE_URL",
    provides: [],
    consumes: [],
    deps: [],
    source_ref: "src/db/client.ts:5",
    origin: "working_tree",
    confidence: 0.85,
  },

  // ── feat/profile-ui (dev-b) — the incoming branch ───────────────────────────
  {
    contract_id: "ct_pu_dep_node_fetch",
    branch: "feat/profile-ui",
    owner: "dev-b",
    version: 1,
    status: "declared",
    kind: "dependency",
    // Incoming HTTP client that conflicts with the established axios.
    symbol: "node-fetch",
    provides: [],
    consumes: [],
    deps: ["node-fetch@3.3.2"],
    source_ref: "package.json:18",
    origin: "working_tree",
    confidence: 1,
  },
  {
    contract_id: "ct_pu_profile_view",
    branch: "feat/profile-ui",
    owner: "dev-b",
    version: 1,
    status: "implementing",
    kind: "type",
    symbol: "ProfileView",
    // userId is a case-variant of the provider's user_id → NAMING_DRIFT;
    // full_name matches exactly, so it does not drift.
    shape: { userId: "string", full_name: "string" },
    provides: ["ProfileView"],
    consumes: ["User"],
    deps: [],
    source_ref: "src/components/types.ts:2",
    origin: "working_tree",
    confidence: 0.96,
  },
  {
    contract_id: "ct_pu_get_user",
    branch: "feat/profile-ui",
    owner: "dev-b",
    version: 1,
    status: "declared",
    kind: "function",
    // A second getUser, redeclared by dev-b → DUP_SYMBOL against dev-a's.
    symbol: "getUser",
    signature: "getUser(userId: string) -> Promise<User>",
    provides: ["getUser"],
    consumes: ["User"],
    deps: [],
    source_ref: "src/profile/user.ts:6",
    origin: "session",
    confidence: 0.7,
  },
  {
    contract_id: "ct_pu_profile_card",
    branch: "feat/profile-ui",
    owner: "dev-b",
    version: 1,
    status: "implementing",
    kind: "function",
    symbol: "ProfileCard",
    signature: "ProfileCard(props: { userId: string }) -> JSX.Element",
    provides: ["ProfileCard"],
    consumes: ["getUser"],
    deps: ["node-fetch@3.3.2"],
    source_ref: "src/components/ProfileCard.tsx:12",
    origin: "working_tree",
    confidence: 0.9,
  },
  {
    contract_id: "ct_pu_route_get_profile",
    branch: "feat/profile-ui",
    owner: "dev-b",
    version: 2,
    status: "changed",
    kind: "route",
    symbol: "GET /profile/:id",
    signature: "GET /profile/:id -> ProfileView",
    provides: ["GET /profile/:id"],
    consumes: ["ProfileView"],
    deps: [],
    source_ref: "src/routes/profile.tsx:8",
    origin: "working_tree",
    confidence: 0.88,
  },
  {
    contract_id: "ct_pu_env_api",
    branch: "feat/profile-ui",
    owner: "dev-b",
    version: 1,
    status: "declared",
    kind: "env",
    symbol: "NEXT_PUBLIC_API_URL",
    provides: [],
    consumes: [],
    deps: [],
    source_ref: "src/config.ts:4",
    origin: "working_tree",
    confidence: 0.8,
  },

  // ── feat/search (dev-c) — pinned consumer; drives STALE_BINDING ──────────────
  {
    contract_id: "ct_se_search_users",
    branch: "feat/search",
    owner: "dev-c",
    version: 1,
    status: "implementing",
    kind: "function",
    symbol: "searchUsers",
    signature: "searchUsers(q: string) -> Promise<User[]>",
    provides: ["searchUsers"],
    consumes: ["User"],
    deps: [],
    source_ref: "src/search/index.ts:11",
    origin: "working_tree",
    confidence: 0.82,
  },
  {
    contract_id: "ct_se_route_search",
    branch: "feat/search",
    owner: "dev-c",
    version: 1,
    status: "declared",
    kind: "route",
    symbol: "GET /api/search",
    signature: "GET /api/search?q -> User[]",
    provides: ["GET /api/search"],
    consumes: ["User"],
    deps: [],
    source_ref: "src/search/routes.ts:7",
    origin: "working_tree",
    confidence: 0.86,
  },
];

export interface DemoData {
  contracts: Contract[];
  bindings: Record<string, Binding[]>;
  nowMs: number;
}

/** Build the demo contracts with fresh, load-relative timestamps. */
export function buildDemo(opts: { dormant: boolean }): DemoData {
  const nowMs = Date.now();
  const contracts = SEEDS.map((seed): Contract => {
    const base = HEARTBEAT_SECONDS[seed.branch] ?? 30;
    const ageSeconds =
      opts.dormant && seed.branch === DORMANT_BRANCH ? DORMANT_SECONDS : base;
    return {
      ...seed,
      repo: REPO,
      declared_at: new Date(nowMs - ageSeconds * 1000).toISOString(),
    };
  });
  return { contracts, bindings: BINDINGS, nowMs };
}
