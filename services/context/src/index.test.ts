// Handler tests for @handshake/context. aws-sdk-client-mock stands in for
// DynamoDB. Asserts the query key shape and the active/owner filtering, not just
// the HTTP status.

import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { Contract, ContractStatus } from "@handshake/shared";
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

function stored(
  over: Partial<Contract> & Pick<Contract, "contract_id" | "symbol"> & { status: ContractStatus },
): Record<string, unknown> {
  const contract: Contract = {
    kind: "type",
    provides: [over.symbol],
    consumes: [],
    deps: [],
    source_ref: "src/user.ts:1",
    origin: "working_tree",
    confidence: 1,
    repo: REPO,
    branch: "feat/user-api",
    owner: "dev-a",
    version: 1,
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

function get(
  query: Record<string, string | undefined>,
  token: string | null = `Bearer ${TOKEN}`,
): APIGatewayProxyEventV2 {
  return {
    headers: token === null ? {} : { authorization: token },
    queryStringParameters: query,
  } as unknown as APIGatewayProxyEventV2;
}

function bodyOf(res: APIGatewayProxyStructuredResultV2): { contracts: Contract[] } {
  return JSON.parse(res.body as string);
}

beforeEach(() => {
  ddbMock.reset();
});

describe("context handler", () => {
  it("returns the repo's active contracts and queries the right key", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        stored({ contract_id: "ct_a", symbol: "User", status: "declared" }),
        stored({ contract_id: "ct_b", symbol: "getUser", kind: "function", status: "implemented" }),
      ],
    });

    const res = await invoke(get({ repo: REPO }));

    expect(res.statusCode).toBe(200);
    const query = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(query.TableName).toBe(TABLE);
    expect(query.KeyConditionExpression).toBe("PK = :pk AND begins_with(SK, :sk)");
    expect(query.ExpressionAttributeValues).toMatchObject({ ":pk": `REPO#${REPO}`, ":sk": "CONTRACT#" });

    const ids = bodyOf(res).contracts.map((c) => c.contract_id);
    expect(ids).toEqual(["ct_a", "ct_b"]);
  });

  it("excludes the caller's own contracts via exclude_owner", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        stored({ contract_id: "ct_mine", symbol: "Mine", owner: "dev-b", status: "declared" }),
        stored({ contract_id: "ct_theirs", symbol: "Theirs", owner: "dev-a", status: "declared" }),
      ],
    });

    const res = await invoke(get({ repo: REPO, exclude_owner: "dev-b" }));

    const contracts = bodyOf(res).contracts;
    expect(contracts.map((c) => c.contract_id)).toEqual(["ct_theirs"]);
    expect(contracts.every((c) => c.owner !== "dev-b")).toBe(true);
  });

  it("omits changed and abandoned contracts", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        stored({ contract_id: "ct_live", symbol: "Live", status: "declared" }),
        stored({ contract_id: "ct_changed", symbol: "Old", version: 1, status: "changed" }),
        stored({ contract_id: "ct_dead", symbol: "Dropped", status: "abandoned" }),
      ],
    });

    const res = await invoke(get({ repo: REPO }));

    expect(bodyOf(res).contracts.map((c) => c.contract_id)).toEqual(["ct_live"]);
  });

  it("returns an empty array for a repo with no contracts", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const res = await invoke(get({ repo: "acme/empty" }));

    expect(res.statusCode).toBe(200);
    expect(bodyOf(res).contracts).toEqual([]);
  });
});
