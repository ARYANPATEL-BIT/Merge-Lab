// Handler tests for @handshake/ingest. Uses aws-sdk-client-mock so no real AWS
// is touched. Asserts the DynamoDB commands sent — key shape, version, status —
// not just the HTTP status, since a handler that returns 200 while writing the
// wrong key is exactly what these guard against.

import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { Contract, Declaration } from "@handshake/shared";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";

const TABLE = "handshake-test";
const TOKEN = "s3cr3t";
process.env.TABLE_NAME = TABLE;
process.env.HANDSHAKE_TOKEN = TOKEN;

const ddbMock = mockClient(DynamoDBDocumentClient);
// Dynamic import so the handler module reads TABLE_NAME/HANDSHAKE_TOKEN after
// they are set above (static imports would evaluate the module first).
const { handler } = await import("./index.js");

// The handlers always return the structured (object) form of the union.
async function invoke(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  return (await handler(event)) as APIGatewayProxyStructuredResultV2;
}

const REPO = "acme/app";

function decl(over: Partial<Declaration> & Pick<Declaration, "symbol">): Declaration {
  return {
    kind: "type",
    provides: [over.symbol],
    consumes: [],
    deps: [],
    source_ref: "src/user.ts:1",
    origin: "working_tree",
    confidence: 1,
    ...over,
  };
}

/** A prior contract row as stored in DynamoDB, built from a declaration. */
function stored(d: Declaration, over: Partial<Contract> & Pick<Contract, "contract_id">): Record<string, unknown> {
  const contract: Contract = {
    ...d,
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

function post(body: unknown, token: string | null = `Bearer ${TOKEN}`): APIGatewayProxyEventV2 {
  return {
    headers: token === null ? {} : { authorization: token },
    body: typeof body === "string" ? body : JSON.stringify(body),
  } as unknown as APIGatewayProxyEventV2;
}

function request(declarations: Declaration[]) {
  return {
    schema_version: 1,
    repo: REPO,
    branch: "feat/profile-ui",
    owner: "dev-b",
    origin: "working_tree",
    declarations,
  };
}

function puts() {
  return ddbMock.commandCalls(PutCommand).map((c) => c.args[0].input);
}

beforeEach(() => {
  ddbMock.reset();
  // Default: no prior contracts for the repo.
  ddbMock.on(QueryCommand).resolves({ Items: [] });
});

describe("ingest handler", () => {
  it("writes a new contract with the correct key shape, contract_id and version 1", async () => {
    const res = await invoke(post(request([decl({ symbol: "Invoice", shape: { total: "number" } })])));

    expect(res.statusCode).toBe(200);

    // It read prior contracts for the repo first.
    const query = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(query.TableName).toBe(TABLE);
    expect(query.ExpressionAttributeValues).toMatchObject({ ":pk": `REPO#${REPO}`, ":sk": "CONTRACT#" });

    const written = puts();
    expect(written).toHaveLength(1);
    const item = written[0].Item as Record<string, unknown>;
    expect(written[0].TableName).toBe(TABLE);
    expect(item).toMatchObject({
      PK: `REPO#${REPO}`,
      SK: "CONTRACT#Invoice#v1",
      GSI1PK: `REPO#${REPO}#BRANCH#feat/profile-ui`,
      GSI1SK: "CONTRACT#Invoice#v1",
      entity: "CONTRACT",
      repo: REPO,
      branch: "feat/profile-ui",
      owner: "dev-b",
      symbol: "Invoice",
      version: 1,
      status: "declared",
    });
    expect(typeof item.contract_id).toBe("string");
    expect(item.contract_id).toBeTruthy();
    expect(item.supersedes).toBeUndefined();

    // Response echoes the persisted contract.
    const body = JSON.parse(res.body as string);
    expect(body.contracts).toHaveLength(1);
    expect(body.contracts[0]).toMatchObject({ symbol: "Invoice", version: 1, status: "declared" });
  });

  it("is a no-op when an identical shape is republished (same shapeHash)", async () => {
    const d = decl({ symbol: "User", shape: { user_id: "string" } });
    ddbMock.on(QueryCommand).resolves({ Items: [stored(d, { contract_id: "ct_user_v1" })] });

    // Republish differs only in source_ref, which shapeHash ignores.
    const republish = decl({ symbol: "User", shape: { user_id: "string" }, source_ref: "src/user.ts:99" });
    const res = await invoke(post(request([republish])));

    expect(res.statusCode).toBe(200);
    expect(puts()).toHaveLength(0); // no new version written

    const body = JSON.parse(res.body as string);
    expect(body.contracts[0]).toMatchObject({ contract_id: "ct_user_v1", version: 1 });
  });

  it("bumps the version, sets supersedes, and marks the prior 'changed' on a shape change", async () => {
    const prior = stored(decl({ symbol: "User", shape: { user_id: "string" } }), {
      contract_id: "ct_user_v1",
      version: 1,
    });
    ddbMock.on(QueryCommand).resolves({ Items: [prior] });

    const changed = decl({ symbol: "User", shape: { user_id: "string", email: "string" } });
    const res = await invoke(post(request([changed])));

    expect(res.statusCode).toBe(200);
    const written = puts();
    expect(written).toHaveLength(2);

    const items = written.map((w) => w.Item as Record<string, unknown>);
    const next = items.find((i) => i.status === "declared")!;
    const superseded = items.find((i) => i.status === "changed")!;

    expect(next).toMatchObject({
      SK: "CONTRACT#User#v2",
      symbol: "User",
      version: 2,
      status: "declared",
      supersedes: "ct_user_v1",
    });
    expect(superseded).toMatchObject({
      SK: "CONTRACT#User#v1",
      contract_id: "ct_user_v1",
      version: 1,
      status: "changed",
    });
  });

  it("returns 400 on a malformed body without writing anything", async () => {
    const res = await invoke(post("{ not json"));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body as string).error).toBe("invalid_json");
    expect(ddbMock.calls()).toHaveLength(0);
  });

  it("returns 401 on a wrong bearer token without touching DynamoDB", async () => {
    const res = await invoke(post(request([decl({ symbol: "Invoice" })]), "Bearer wrong"));

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body as string).error).toBe("unauthorized");
    expect(ddbMock.calls()).toHaveLength(0);
  });
});
