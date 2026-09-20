// Handler tests for the workspace endpoints. aws-sdk-client-mock stands in for
// DynamoDB. These cover create/list/detail/join/approve plus the owner-only
// guard; they do not touch the untouched signup/login flow.

import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { hashToken } from "@mergelab/shared";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";

const TABLE = "mergelab-test";
const LEGACY = "s3cr3t";
process.env.TABLE_NAME = TABLE;
process.env.MERGELAB_TOKEN = LEGACY;

const ddbMock = mockClient(DynamoDBDocumentClient);
const { handler } = await import("./index.js");

async function invoke(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  return (await handler(event)) as APIGatewayProxyStructuredResultV2;
}

function ev(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string | null } = {},
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return {
    rawPath: path,
    requestContext: { http: { method, path } },
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

function puts() {
  return ddbMock.commandCalls(PutCommand).map((c) => c.args[0].input.Item as Record<string, unknown>);
}

beforeEach(() => {
  ddbMock.reset();
});

describe("POST /v1/workspaces (create)", () => {
  it("creates a workspace and returns a join code plus an owner token", async () => {
    ddbMock.on(PutCommand).resolves({});

    const res = await invoke(
      ev("POST", "/v1/workspaces", { body: { name: "Acme Team", display_name: "Ada" } }),
    );

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body || "{}");
    expect(body.workspace.name).toBe("Acme Team");
    expect(body.workspace.slug).toBe("acme-team");
    expect(body.workspace.join_code).toMatch(/^ML-[A-HJ-NP-Z2-9]{5}$/);
    expect(body.token).toMatch(/^ml_ws_/);

    const written = puts();
    const skOf = (pred: (i: Record<string, unknown>) => boolean) => written.find(pred);
    // META, owner MEMBER#, JOIN lookup, WS TOKEN + global TOKEN lookup.
    expect(skOf((i) => i.SK === "META")).toBeTruthy();
    expect(skOf((i) => String(i.SK).startsWith("MEMBER#") && i.role === "owner")).toBeTruthy();
    expect(skOf((i) => String(i.PK).startsWith("JOIN#"))).toBeTruthy();
    expect(skOf((i) => String(i.SK).startsWith("TOKEN#"))).toBeTruthy();
    // The stored token row carries a hash, never the plaintext token.
    const tokenLookup = skOf((i) => i.PK === `TOKEN#${hashToken(body.token)}`);
    expect(tokenLookup).toMatchObject({ role: "owner", revoked: false });
  });

  it("rejects a workspace with no name", async () => {
    const res = await invoke(ev("POST", "/v1/workspaces", { body: { display_name: "Ada" } }));
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /v1/workspaces (list)", () => {
  it("synthesizes the default workspace for the legacy static token without a token lookup", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const res = await invoke(ev("GET", "/v1/workspaces", { token: LEGACY }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body || "{}");
    expect(body.workspaces).toHaveLength(1);
    expect(body.workspaces[0].workspace_id).toBe("default");
    // Legacy path must not hit the TOKEN# lookup.
    expect(ddbMock.commandCalls(GetCommand)).toHaveLength(0);
  });

  it("returns the workspace a real token belongs to, with rollup counts", async () => {
    const token = "ml_ws_realtoken";
    ddbMock.on(GetCommand).resolves({
      Item: { workspace_id: "ws_1", role: "member", user_id: "usr_1", revoked: false },
    });
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          PK: "WS#ws_1",
          SK: "META",
          workspace_id: "ws_1",
          name: "Acme",
          slug: "acme",
          owner_user_id: "usr_0",
          join_code: "ML-ABCDE",
          created_at: "2026-09-20T00:00:00Z",
        },
        { PK: "WS#ws_1", SK: "MEMBER#usr_0", user_id: "usr_0", display_name: "Ada", role: "owner", joined_at: "x" },
        { PK: "WS#ws_1", SK: "REPO#acme/app", repo: "acme/app" },
      ],
    });

    const res = await invoke(ev("GET", "/v1/workspaces", { token }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body || "{}");
    expect(body.workspaces[0]).toMatchObject({ workspace_id: "ws_1", member_count: 1, repo_count: 1 });
  });
});

describe("GET /v1/workspaces/:id (detail)", () => {
  it("splits members, pending requests, repos and tokens", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { workspace_id: "ws_1", role: "owner", user_id: "usr_0", revoked: false },
    });
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          PK: "WS#ws_1",
          SK: "META",
          workspace_id: "ws_1",
          name: "Acme",
          slug: "acme",
          owner_user_id: "usr_0",
          join_code: "ML-ABCDE",
          created_at: "2026-09-20T00:00:00Z",
        },
        { PK: "WS#ws_1", SK: "MEMBER#usr_0", user_id: "usr_0", display_name: "Ada", role: "owner", joined_at: "x" },
        { PK: "WS#ws_1", SK: "REQ#usr_9", user_id: "usr_9", display_name: "Grace", requested_at: "y", status: "pending" },
        { PK: "WS#ws_1", SK: "REQ#usr_8", user_id: "usr_8", display_name: "Old", requested_at: "y", status: "denied" },
        { PK: "WS#ws_1", SK: "REPO#acme/app", repo: "acme/app" },
        { PK: "WS#ws_1", SK: "TOKEN#deadbeef", hash: "deadbeef", label: "Ada (owner)", created_at: "z", revoked: false },
      ],
    });

    const res = await invoke(ev("GET", "/v1/workspaces/ws_1", { token: "ml_ws_t" }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body || "{}");
    expect(body.members).toHaveLength(1);
    expect(body.pending_requests).toHaveLength(1); // only the pending one
    expect(body.pending_requests[0].display_name).toBe("Grace");
    expect(body.repos).toEqual(["acme/app"]);
    expect(body.tokens).toHaveLength(1);
  });

  it("forbids reading a workspace the token does not belong to", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { workspace_id: "ws_OTHER", role: "owner", user_id: "usr_0", revoked: false },
    });
    const res = await invoke(ev("GET", "/v1/workspaces/ws_1", { token: "ml_ws_t" }));
    expect(res.statusCode).toBe(403);
  });
});

describe("POST /v1/workspaces/join", () => {
  it("creates a pending join request from a join code and a display name", async () => {
    ddbMock.on(GetCommand, { Key: { PK: "JOIN#ML-ABCDE", SK: "WORKSPACE" } }).resolves({
      Item: { workspace_id: "ws_1" },
    });
    ddbMock.on(GetCommand, { Key: { PK: "WS#ws_1", SK: "META" } }).resolves({
      Item: { name: "Acme" },
    });
    ddbMock.on(PutCommand).resolves({});

    const res = await invoke(
      ev("POST", "/v1/workspaces/join", { body: { join_code: "ml-abcde", display_name: "Grace" } }),
    );

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body || "{}");
    expect(body.workspace_id).toBe("ws_1");
    expect(body.workspace_name).toBe("Acme");
    expect(body.request).toMatchObject({ display_name: "Grace", status: "pending" });
    const req = puts().find((i) => String(i.SK).startsWith("REQ#"));
    expect(req).toMatchObject({ status: "pending", display_name: "Grace" });
  });

  it("returns 404 for an unknown join code", async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    const res = await invoke(
      ev("POST", "/v1/workspaces/join", { body: { join_code: "ML-ZZZZZ", display_name: "Grace" } }),
    );
    expect(res.statusCode).toBe(404);
  });
});

describe("owner-only actions", () => {
  it("approves a join request, adds a member, and mints a member token", async () => {
    ddbMock.on(GetCommand, { Key: { PK: `TOKEN#${hashToken("ml_ws_owner")}`, SK: "WORKSPACE" } }).resolves({
      Item: { workspace_id: "ws_1", role: "owner", user_id: "usr_0", revoked: false },
    });
    ddbMock.on(GetCommand, { Key: { PK: "WS#ws_1", SK: "REQ#usr_9" } }).resolves({
      Item: { user_id: "usr_9", display_name: "Grace", status: "pending" },
    });
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const res = await invoke(
      ev("POST", "/v1/workspaces/ws_1/requests/usr_9/approve", { token: "ml_ws_owner" }),
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body || "{}");
    expect(body.token).toMatch(/^ml_ws_/);
    const member = puts().find((i) => i.SK === "MEMBER#usr_9");
    expect(member).toMatchObject({ role: "member", display_name: "Grace" });
  });

  it("forbids a non-owner (member token) from approving", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { workspace_id: "ws_1", role: "member", user_id: "usr_9", revoked: false },
    });
    const res = await invoke(
      ev("POST", "/v1/workspaces/ws_1/requests/usr_9/approve", { token: "ml_ws_member" }),
    );
    expect(res.statusCode).toBe(403);
  });

  it("requires a token to mint a workspace token", async () => {
    const res = await invoke(ev("POST", "/v1/workspaces/ws_1/tokens", { body: { label: "CI" } }));
    expect(res.statusCode).toBe(401);
  });
});
