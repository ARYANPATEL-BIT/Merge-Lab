// Handler tests for @handshake/verdict. aws-sdk-client-mock stands in for
// DynamoDB. The handler owns two reads — active contracts and branch bindings —
// so the mock routes on the SK prefix, and the tests assert the verdict the
// deterministic rule engine produces from them.

import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { Contract, Declaration, Finding, VerdictDecision } from "@handshake/shared";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";

const TABLE = "handshake-test";
const TOKEN = "s3cr3t";
process.env.TABLE_NAME = TABLE;
process.env.HANDSHAKE_TOKEN = TOKEN;

const ddbMock = mockClient(DynamoDBDocumentClient);
const { handler } = await import("./index.js");

// The handler always returns the structured (object) form of the union.
async function invoke(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  return (await handler(event)) as APIGatewayProxyStructuredResultV2;
}

const REPO = "acme/app";
const BRANCH = "feat/profile-ui";

function decl(over: Partial<Declaration> & Pick<Declaration, "kind" | "symbol">): Declaration {
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

function stored(
  over: Partial<Contract> & Pick<Contract, "contract_id" | "kind" | "symbol">,
): Record<string, unknown> {
  const contract: Contract = {
    provides: [],
    consumes: [],
    deps: [],
    source_ref: "src/api/user.ts:1",
    origin: "working_tree",
    confidence: 1,
    repo: REPO,
    branch: "feat/user-api",
    owner: "dev-a",
    version: 1,
    status: "declared",
    declared_at: "2026-09-18T09:00:00Z",
    ...over,
  };
  return {
    PK: `REPO#${contract.repo}`,
    SK: `CONTRACT#${contract.symbol}#v${contract.version}`,
    entity: "CONTRACT",
    ...contract,
  };
}

/** Route Query calls by SK prefix: CONTRACT# rows vs BIND# rows. */
function seed(contracts: Record<string, unknown>[], binds: Record<string, unknown>[] = []) {
  ddbMock.on(QueryCommand).callsFake((input) => {
    const sk = input.ExpressionAttributeValues?.[":sk"] as string;
    if (sk.startsWith("BIND#")) return { Items: binds };
    return { Items: contracts };
  });
}

function post(body: unknown, token: string | null = `Bearer ${TOKEN}`): APIGatewayProxyEventV2 {
  return {
    headers: token === null ? {} : { authorization: token },
    body: typeof body === "string" ? body : JSON.stringify(body),
  } as unknown as APIGatewayProxyEventV2;
}

function request(declarations: Declaration[], owner = "dev-b") {
  return { repo: REPO, branch: BRANCH, owner, declarations };
}

function bodyOf(res: APIGatewayProxyStructuredResultV2): {
  verdict: VerdictDecision;
  findings: Finding[];
} {
  return JSON.parse(res.body as string);
}

beforeEach(() => {
  ddbMock.reset();
});

describe("verdict handler", () => {
  it("blocks when an incoming declaration conflicts with an active contract", async () => {
    seed([
      stored({ contract_id: "ct_route", kind: "route", symbol: "POST /api/users", provides: ["POST /api/users"] }),
    ]);

    const res = await invoke(
      post(request([decl({ kind: "route", symbol: "POST /api/users", provides: ["POST /api/users"] })])),
    );

    expect(res.statusCode).toBe(200);
    const body = bodyOf(res);
    expect(body.verdict).toBe("block");
    expect(body.findings).toEqual([
      expect.objectContaining({ rule: "ROUTE_COLLISION", severity: "block", contract_ids: ["ct_route"] }),
    ]);
  });

  it("allows when the incoming declarations are clean", async () => {
    seed([stored({ contract_id: "ct_user", kind: "type", symbol: "User", provides: ["User"] })]);

    const res = await invoke(
      post(request([decl({ kind: "function", symbol: "renderProfile", provides: ["renderProfile"] })])),
    );

    expect(res.statusCode).toBe(200);
    const body = bodyOf(res);
    expect(body.verdict).toBe("allow");
    expect(body.findings).toEqual([]);
  });

  it("passes branch bindings through to runRules so STALE_BINDING fires", async () => {
    // Provider (a teammate) is at User v2; this branch is pinned to v1.
    seed(
      [stored({ contract_id: "ct_user_v2", kind: "type", symbol: "User", provides: ["User"], version: 2 })],
      [{ symbol: "User", bound_version: 1 }],
    );

    const res = await invoke(
      post(request([decl({ kind: "function", symbol: "renderProfile", provides: ["renderProfile"], consumes: ["User"] })])),
    );

    const body = bodyOf(res);
    expect(body.findings).toEqual([
      expect.objectContaining({ rule: "STALE_BINDING", severity: "notify", contract_ids: ["ct_user_v2"] }),
    ]);
    // notify does not block or warn.
    expect(body.verdict).toBe("allow");

    // The bindings really were read from the branch's BIND# partition.
    const bindQuery = ddbMock
      .commandCalls(QueryCommand)
      .map((c) => c.args[0].input)
      .find((i) => (i.ExpressionAttributeValues?.[":sk"] as string).startsWith("BIND#"));
    expect(bindQuery?.ExpressionAttributeValues).toMatchObject({ ":sk": `BIND#${BRANCH}#` });
  });

  it("returns 400 on a malformed body without querying DynamoDB", async () => {
    seed([]);

    const res = await invoke(post("{ broken"));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body as string).error).toBe("invalid_json");
    expect(ddbMock.calls()).toHaveLength(0);
  });
});
