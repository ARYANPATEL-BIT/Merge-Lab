// Rule scenarios for services/resolver - one per RuleId. Provider is dev-a on
// feat/user-api; consumer is dev-b on feat/profile-ui throughout.

import type { Contract, Declaration, Finding, RuleId } from "@mergelab/shared";

export interface Scenario {
  name: string;
  rule: RuleId;
  active: Contract[];
  incoming: Declaration[];
  /** Registry bindings for this branch; only STALE_BINDING reads them. */
  bindings?: { symbol: string; version: number }[];
  expected: Finding[];
}

const REPO = "acme/app";
const PROVIDER = { owner: "dev-a", branch: "feat/user-api" };

function contract(
  over: Partial<Contract> & Pick<Contract, "kind" | "symbol" | "contract_id">,
): Contract {
  return {
    provides: [],
    consumes: [],
    deps: [],
    source_ref: "src/api/user.ts:1",
    origin: "working_tree",
    confidence: 1,
    repo: REPO,
    owner: PROVIDER.owner,
    branch: PROVIDER.branch,
    version: 1,
    status: "declared",
    declared_at: "2026-09-18T09:00:00Z",
    ...over,
  };
}

function decl(
  over: Partial<Declaration> & Pick<Declaration, "kind" | "symbol">,
): Declaration {
  return {
    provides: [],
    consumes: [],
    deps: [],
    source_ref: "src/profile.ts:1",
    origin: "working_tree",
    confidence: 1,
    ...over,
  };
}

const USER_SHAPE = {
  user_id: "string",
  full_name: "string",
  created_at: "string",
};

export const scenarios: Scenario[] = [
  {
    name: "axios active, node-fetch incoming",
    rule: "DEP_CONFLICT",
    active: [contract({ contract_id: "ct_axios", kind: "dependency", symbol: "axios", deps: ["axios@1.7.2"] })],
    incoming: [decl({ kind: "dependency", symbol: "node-fetch", deps: ["node-fetch@3.3.2"] })],
    expected: [
      {
        rule: "DEP_CONFLICT",
        severity: "block",
        reason:
          "This repo uses axios for HTTP (dev-a, feat/user-api). Adding node-fetch means two HTTP clients.",
        contract_ids: ["ct_axios"],
      },
    ],
  },
  {
    name: "userId vs user_id",
    rule: "NAMING_DRIFT",
    active: [contract({ contract_id: "ct_user", kind: "type", symbol: "User", provides: ["User"], shape: USER_SHAPE })],
    incoming: [decl({ kind: "type", symbol: "ProfileView", provides: ["ProfileView"], consumes: ["User"], shape: { userId: "string" } })],
    expected: [
      {
        rule: "NAMING_DRIFT",
        severity: "block",
        reason:
          "Field userId drifts from user_id in User (declared by dev-a on feat/user-api); match the existing casing.",
        contract_ids: ["ct_user"],
      },
    ],
  },
  {
    name: "getUser redeclared by dev-b",
    rule: "DUP_SYMBOL",
    active: [contract({ contract_id: "ct_getuser", kind: "function", symbol: "getUser", provides: ["getUser"], signature: "getUser(id: string) -> Promise<User>" })],
    incoming: [decl({ kind: "function", symbol: "getUser", provides: ["getUser"], signature: "getUser(id: string) -> User" })],
    expected: [
      {
        rule: "DUP_SYMBOL",
        severity: "warn",
        reason: "getUser is already declared by dev-a on feat/user-api; pick a different name or coordinate.",
        contract_ids: ["ct_getuser"],
      },
    ],
  },
  {
    name: "POST /api/users collision",
    rule: "ROUTE_COLLISION",
    active: [contract({ contract_id: "ct_route_users", kind: "route", symbol: "POST /api/users", provides: ["POST /api/users"] })],
    incoming: [decl({ kind: "route", symbol: "POST /api/users", provides: ["POST /api/users"] })],
    expected: [
      {
        rule: "ROUTE_COLLISION",
        severity: "block",
        reason: "Route POST /api/users is already declared by dev-a on feat/user-api; two handlers would collide.",
        contract_ids: ["ct_route_users"],
      },
    ],
  },
  {
    name: "consumer reads User.email",
    rule: "SHAPE_MISMATCH",
    active: [contract({ contract_id: "ct_user_shape", kind: "type", symbol: "User", provides: ["User"], shape: USER_SHAPE })],
    incoming: [decl({ kind: "type", symbol: "ProfileCard", provides: ["ProfileCard"], consumes: ["User"], shape: { user_id: "string", email: "string" } })],
    expected: [
      {
        rule: "SHAPE_MISMATCH",
        severity: "block",
        reason: "User.email does not exist on the User shape declared by dev-a on feat/user-api.",
        contract_ids: ["ct_user_shape"],
      },
    ],
  },
  {
    name: "pinned to User v1, provider at v2",
    rule: "STALE_BINDING",
    active: [contract({ contract_id: "ct_user_v2", kind: "type", symbol: "User", provides: ["User"], version: 2, shape: USER_SHAPE })],
    incoming: [decl({ kind: "function", symbol: "renderProfile", provides: ["renderProfile"], consumes: ["User"] })],
    bindings: [{ symbol: "User", version: 1 }],
    expected: [
      {
        rule: "STALE_BINDING",
        severity: "notify",
        reason: "You are pinned to User v1 but dev-a has published v2 on feat/user-api.",
        contract_ids: ["ct_user_v2"],
      },
    ],
  },
];
