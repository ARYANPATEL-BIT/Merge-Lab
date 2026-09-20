// Handler tests for @mergelab/board-service. aws-sdk-client-mock stands in for
// DynamoDB. Asserts the assembled snapshot - branches with heartbeat status,
// contracts, and the cross-branch drift feed - that assembleBoard produces from
// the rows the handler reads.

import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { BranchSummary, Contract, Finding } from "@mergelab/shared";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";

const TABLE = "mergelab-test";
const TOKEN = "s3cr3t";
process.env.TABLE_NAME = TABLE;
process.env.MERGELAB_TOKEN = TOKEN;

const ddbMock = mockClient(DynamoDBDocumentClient);
const { handler } = await import("./index.js");

// The handler always returns the structured (object) form of the union.
async function invoke(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  return (await handler(event)) as APIGatewayProxyStructuredResultV2;
}

const REPO = "acme/app";

function stored(
  over: Partial<Contract> & Pick<Contract, "contract_id" | "kind" | "symbol" | "owner" | "branch" | "declared_at">,
): Record<string, unknown> {
  const contract: Contract = {
    provides: [],
    consumes: [],
    deps: [],
    source_ref: "src/api/user.ts:1",
    origin: "working_tree",
    confidence: 1,
    repo: REPO,
    version: 1,
    status: "declared",
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

function get(
  query: Record<string, string | undefined>,
  token: string | null = `Bearer ${TOKEN}`,
): APIGatewayProxyEventV2 {
  return {
    headers: token === null ? {} : { authorization: token },
    queryStringParameters: query,
  } as unknown as APIGatewayProxyEventV2;
}

function bodyOf(res: APIGatewayProxyStructuredResultV2): {
  branches: BranchSummary[];
  contracts: Contract[];
  findings: Finding[];
} {
  return JSON.parse(res.body as string);
}

beforeEach(() => {
  ddbMock.reset();
});

describe("board handler", () => {
  it("returns branches, contracts and cross-branch findings in one response", async () => {
    const now = new Date().toISOString();
    seed([
      stored({
        contract_id: "ct_a",
        kind: "route",
        symbol: "POST /api/users",
        provides: ["POST /api/users"],
        owner: "dev-a",
        branch: "feat/user-api",
        declared_at: now,
      }),
      stored({
        contract_id: "ct_b",
        kind: "route",
        symbol: "POST /api/users",
        provides: ["POST /api/users"],
        owner: "dev-b",
        branch: "feat/profile-ui",
        declared_at: now,
      }),
    ]);

    const res = await invoke(get({ repo: REPO }));

    expect(res.statusCode).toBe(200);
    const board = bodyOf(res);

    expect(board.branches.map((b) => b.branch).sort()).toEqual(["feat/profile-ui", "feat/user-api"]);
    expect(board.contracts.map((c) => c.contract_id).sort()).toEqual(["ct_a", "ct_b"]);
    // The two branches declare the same route - one collapsed collision finding.
    expect(board.findings).toEqual([
      expect.objectContaining({ rule: "ROUTE_COLLISION", severity: "block" }),
    ]);

    // Both partitions were read for the repo.
    const skValues = ddbMock
      .commandCalls(QueryCommand)
      .map((c) => c.args[0].input.ExpressionAttributeValues?.[":sk"]);
    expect(skValues).toContain("CONTRACT#");
    expect(skValues).toContain("BIND#");
  });

  it("marks a branch dormant when its latest declaration is older than the heartbeat window", async () => {
    seed([
      stored({
        contract_id: "ct_live",
        kind: "type",
        symbol: "User",
        owner: "dev-a",
        branch: "feat/user-api",
        declared_at: new Date().toISOString(),
      }),
      stored({
        contract_id: "ct_old",
        kind: "type",
        symbol: "Legacy",
        owner: "dev-c",
        branch: "feat/legacy",
        declared_at: "2020-01-01T00:00:00Z",
      }),
    ]);

    const res = await invoke(get({ repo: REPO }));

    const board = bodyOf(res);
    const byBranch = Object.fromEntries(board.branches.map((b) => [b.branch, b]));
    expect(byBranch["feat/user-api"].status).toBe("active");
    expect(byBranch["feat/legacy"]).toMatchObject({
      status: "dormant",
      last_reported: "2020-01-01T00:00:00Z",
    });
  });

  it("returns 400 when the repo query parameter is missing", async () => {
    seed([]);

    const res = await invoke(get({}));

    expect(res.statusCode).toBe(400);
    expect(ddbMock.calls()).toHaveLength(0);
  });

  it("returns 401 on a wrong bearer token without touching DynamoDB", async () => {
    seed([]);

    const res = await invoke(get({ repo: REPO }, "Bearer wrong"));

    expect(res.statusCode).toBe(401);
    expect(ddbMock.calls()).toHaveLength(0);
  });
});
