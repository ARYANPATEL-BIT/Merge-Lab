// Workspace management for @mergelab/auth-service. ADDITIVE to the existing
// signup/login flow and to the legacy static bearer token: nothing here touches
// either. A workspace token (ml_ws_...) maps to exactly one workspace; the
// legacy MERGELAB_TOKEN resolves to the DEFAULT workspace elsewhere so the CLI
// and hooks keep working unchanged.
//
// Single-table rows (extends the existing table):
//   Workspace    PK=WS#<id>          SK=META
//   Member       PK=WS#<id>          SK=MEMBER#<user_id>
//   JoinRequest  PK=WS#<id>          SK=REQ#<user_id>
//   Token        PK=WS#<id>          SK=TOKEN#<hash>        (source of truth)
//   Repo         PK=WS#<id>          SK=REPO#<repo>         (written by ingest)
//   TokenLookup  PK=TOKEN#<hash>     SK=WORKSPACE           (global token -> ws)
//   JoinLookup   PK=JOIN#<code>      SK=WORKSPACE           (global code -> ws)

import { randomBytes } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import {
  CreateWorkspaceRequestSchema,
  DEFAULT_WORKSPACE_ID,
  JoinWorkspaceRequestSchema,
  MemberSchema,
  MintTokenRequestSchema,
  WorkspaceSchema,
  generateJoinCode,
  generateWorkspaceToken,
  hashToken,
  resolveWorkspaceContext,
  type JoinRequest,
  type Member,
  type Workspace,
  type WorkspaceContext,
  type WorkspaceTokenSummary,
} from "@mergelab/shared";

const TABLE = process.env.TABLE_NAME || "mergelab";
const LEGACY_TOKEN = process.env.MERGELAB_TOKEN;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

function reply(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
    },
    body: JSON.stringify(body),
  };
}

function rawBody(event: APIGatewayProxyEventV2): string {
  if (!event.body) return "";
  return event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
}

function bearer(event: APIGatewayProxyEventV2): string | undefined {
  const h = event.headers ?? {};
  return h.authorization ?? h.Authorization;
}

function genId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || "workspace";
}

async function lookupToken(hash: string): Promise<unknown> {
  const out = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `TOKEN#${hash}`, SK: "WORKSPACE" } }),
  );
  return out.Item;
}

async function context(event: APIGatewayProxyEventV2): Promise<WorkspaceContext | null> {
  return resolveWorkspaceContext(bearer(event), LEGACY_TOKEN, lookupToken);
}

// All rows under one workspace partition, for detail/summary rollups.
async function workspaceRows(workspaceId: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `WS#${workspaceId}` },
        ExclusiveStartKey,
      }),
    );
    for (const item of out.Items ?? []) rows.push(item as Record<string, unknown>);
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return rows;
}

function metaToWorkspace(item: Record<string, unknown> | undefined, id: string): Workspace | null {
  if (!item) {
    // The legacy static token's DEFAULT workspace may have no META row. Present
    // a stable placeholder so the UI and CLI never see an empty void.
    if (id === DEFAULT_WORKSPACE_ID) {
      return {
        workspace_id: DEFAULT_WORKSPACE_ID,
        name: "Default workspace",
        slug: "default",
        owner_user_id: "legacy",
        join_code: "",
        created_at: "1970-01-01T00:00:00.000Z",
      };
    }
    return null;
  }
  const parsed = WorkspaceSchema.safeParse(item);
  return parsed.success ? parsed.data : null;
}

function partitionRows(rows: Record<string, unknown>[]): {
  members: Member[];
  pending: JoinRequest[];
  repos: string[];
  tokens: WorkspaceTokenSummary[];
} {
  const members: Member[] = [];
  const pending: JoinRequest[] = [];
  const repos: string[] = [];
  const tokens: WorkspaceTokenSummary[] = [];
  for (const r of rows) {
    const sk = typeof r.SK === "string" ? r.SK : "";
    if (sk.startsWith("MEMBER#")) {
      const m = MemberSchema.safeParse(r);
      if (m.success) members.push(m.data);
    } else if (sk.startsWith("REQ#")) {
      if (r.status === "pending") {
        pending.push({
          user_id: String(r.user_id),
          display_name: String(r.display_name),
          requested_at: String(r.requested_at),
          status: "pending",
        });
      }
    } else if (sk.startsWith("REPO#")) {
      if (typeof r.repo === "string") repos.push(r.repo);
    } else if (sk.startsWith("TOKEN#")) {
      tokens.push({
        hash: String(r.hash ?? sk.slice("TOKEN#".length)),
        label: String(r.label ?? ""),
        created_at: String(r.created_at ?? ""),
        revoked: Boolean(r.revoked),
      });
    }
  }
  return { members, pending, repos, tokens };
}

// Persist a new workspace token: the WS-partition source of truth plus the
// global lookup row. Returns the plaintext token (shown once) and its summary.
async function mintToken(
  workspaceId: string,
  label: string,
  role: "owner" | "member",
  userId: string,
): Promise<{ token: string; summary: WorkspaceTokenSummary }> {
  const token = generateWorkspaceToken();
  const hash = hashToken(token);
  const created_at = new Date().toISOString();
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `WS#${workspaceId}`,
        SK: `TOKEN#${hash}`,
        entity: "WORKSPACE_TOKEN",
        hash,
        label,
        created_at,
        revoked: false,
      },
    }),
  );
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `TOKEN#${hash}`,
        SK: "WORKSPACE",
        entity: "TOKEN_LOOKUP",
        workspace_id: workspaceId,
        role,
        user_id: userId,
        revoked: false,
      },
    }),
  );
  return { token, summary: { hash, label, created_at, revoked: false } };
}

async function handleCreate(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  let json: unknown;
  try {
    json = JSON.parse(rawBody(event) || "{}");
  } catch {
    return reply(400, { error: "malformed JSON body" });
  }
  const parsed = CreateWorkspaceRequestSchema.safeParse(json);
  if (!parsed.success) return reply(400, { error: "validation failed", issues: parsed.error.issues });

  const { name, display_name } = parsed.data;
  const workspace_id = genId("ws");
  const owner_user_id = genId("usr");
  const join_code = generateJoinCode();
  const created_at = new Date().toISOString();
  const workspace: Workspace = {
    workspace_id,
    name,
    slug: slugify(name),
    owner_user_id,
    join_code,
    created_at,
  };

  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `WS#${workspace_id}`, SK: "META", entity: "WORKSPACE", ...workspace },
    }),
  );
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `WS#${workspace_id}`,
        SK: `MEMBER#${owner_user_id}`,
        entity: "WORKSPACE_MEMBER",
        user_id: owner_user_id,
        display_name,
        role: "owner",
        joined_at: created_at,
      },
    }),
  );
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `JOIN#${join_code}`,
        SK: "WORKSPACE",
        entity: "JOIN_LOOKUP",
        workspace_id,
      },
    }),
  );
  const { token } = await mintToken(workspace_id, `${display_name} (owner)`, "owner", owner_user_id);

  return reply(201, { workspace, token });
}

async function handleList(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const ctx = await context(event);
  if (!ctx) return reply(401, { error: "unauthorized" });

  // A token can see exactly its own workspace.
  const rows = await workspaceRows(ctx.workspace_id);
  const meta = rows.find((r) => r.SK === "META");
  const workspace = metaToWorkspace(meta, ctx.workspace_id);
  if (!workspace) return reply(200, { workspaces: [] });

  const { members, repos } = partitionRows(rows);
  return reply(200, {
    workspaces: [{ ...workspace, member_count: members.length, repo_count: repos.length }],
  });
}

async function handleDetail(
  event: APIGatewayProxyEventV2,
  id: string,
): Promise<APIGatewayProxyResultV2> {
  const ctx = await context(event);
  if (!ctx) return reply(401, { error: "unauthorized" });
  if (ctx.workspace_id !== id) return reply(403, { error: "forbidden" });

  const rows = await workspaceRows(id);
  const workspace = metaToWorkspace(
    rows.find((r) => r.SK === "META"),
    id,
  );
  if (!workspace) return reply(404, { error: "workspace not found" });

  const { members, pending, repos, tokens } = partitionRows(rows);
  return reply(200, { workspace, members, pending_requests: pending, repos, tokens });
}

async function handleJoin(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  let json: unknown;
  try {
    json = JSON.parse(rawBody(event) || "{}");
  } catch {
    return reply(400, { error: "malformed JSON body" });
  }
  const parsed = JoinWorkspaceRequestSchema.safeParse(json);
  if (!parsed.success) return reply(400, { error: "validation failed", issues: parsed.error.issues });

  const join_code = parsed.data.join_code.trim().toUpperCase();
  const lookup = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `JOIN#${join_code}`, SK: "WORKSPACE" } }),
  );
  const workspace_id = lookup.Item?.workspace_id;
  if (typeof workspace_id !== "string") return reply(404, { error: "unknown join code" });

  const meta = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `WS#${workspace_id}`, SK: "META" } }),
  );
  const workspace_name = typeof meta.Item?.name === "string" ? meta.Item.name : "workspace";

  const user_id = genId("usr");
  const requested_at = new Date().toISOString();
  const request: JoinRequest = {
    user_id,
    display_name: parsed.data.display_name,
    requested_at,
    status: "pending",
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `WS#${workspace_id}`,
        SK: `REQ#${user_id}`,
        entity: "JOIN_REQUEST",
        ...request,
      },
    }),
  );

  return reply(201, { workspace_id, workspace_name, request });
}

// Owner-only guard: caller must present a workspace token for THIS workspace
// with the owner role.
async function requireOwner(
  event: APIGatewayProxyEventV2,
  id: string,
): Promise<{ ok: true } | { ok: false; res: APIGatewayProxyResultV2 }> {
  const ctx = await context(event);
  if (!ctx) return { ok: false, res: reply(401, { error: "unauthorized" }) };
  if (ctx.workspace_id !== id || ctx.role !== "owner") {
    return { ok: false, res: reply(403, { error: "forbidden" }) };
  }
  return { ok: true };
}

async function handleApprove(
  event: APIGatewayProxyEventV2,
  id: string,
  userId: string,
): Promise<APIGatewayProxyResultV2> {
  const guard = await requireOwner(event, id);
  if (!guard.ok) return guard.res;

  const req = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `WS#${id}`, SK: `REQ#${userId}` } }),
  );
  if (!req.Item) return reply(404, { error: "join request not found" });
  const display_name = String(req.Item.display_name ?? "member");

  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `WS#${id}`,
        SK: `MEMBER#${userId}`,
        entity: "WORKSPACE_MEMBER",
        user_id: userId,
        display_name,
        role: "member",
        joined_at: new Date().toISOString(),
      },
    }),
  );
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `WS#${id}`, SK: `REQ#${userId}` },
      UpdateExpression: "SET #s = :approved",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":approved": "approved" },
    }),
  );
  const { token, summary } = await mintToken(id, display_name, "member", userId);

  return reply(200, { token, summary });
}

async function handleDeny(
  event: APIGatewayProxyEventV2,
  id: string,
  userId: string,
): Promise<APIGatewayProxyResultV2> {
  const guard = await requireOwner(event, id);
  if (!guard.ok) return guard.res;

  const req = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `WS#${id}`, SK: `REQ#${userId}` } }),
  );
  if (!req.Item) return reply(404, { error: "join request not found" });

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `WS#${id}`, SK: `REQ#${userId}` },
      UpdateExpression: "SET #s = :denied",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":denied": "denied" },
    }),
  );
  return reply(200, { ok: true });
}

async function handleMintToken(
  event: APIGatewayProxyEventV2,
  id: string,
): Promise<APIGatewayProxyResultV2> {
  const guard = await requireOwner(event, id);
  if (!guard.ok) return guard.res;

  let json: unknown;
  try {
    json = JSON.parse(rawBody(event) || "{}");
  } catch {
    return reply(400, { error: "malformed JSON body" });
  }
  const parsed = MintTokenRequestSchema.safeParse(json);
  if (!parsed.success) return reply(400, { error: "validation failed", issues: parsed.error.issues });

  const { token, summary } = await mintToken(id, parsed.data.label, "member", genId("svc"));
  return reply(201, { token, summary });
}

async function handleRevokeToken(
  event: APIGatewayProxyEventV2,
  id: string,
  hash: string,
): Promise<APIGatewayProxyResultV2> {
  const guard = await requireOwner(event, id);
  if (!guard.ok) return guard.res;

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `WS#${id}`, SK: `TOKEN#${hash}` },
      UpdateExpression: "SET revoked = :t",
      ExpressionAttributeValues: { ":t": true },
    }),
  );
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `TOKEN#${hash}`, SK: "WORKSPACE" },
      UpdateExpression: "SET revoked = :t",
      ExpressionAttributeValues: { ":t": true },
    }),
  );
  return reply(200, { ok: true });
}

// Router for anything under /v1/workspaces. Returns null when the path is not a
// workspace route, so index.ts can fall through to signup/login/404.
export async function routeWorkspaces(
  event: APIGatewayProxyEventV2,
  method: string,
  path: string,
): Promise<APIGatewayProxyResultV2 | null> {
  const marker = "/v1/workspaces";
  const idx = path.indexOf(marker);
  if (idx === -1) return null;
  const rest = path.slice(idx + marker.length).replace(/^\/+|\/+$/g, "");
  const segs = rest === "" ? [] : rest.split("/").map((s) => decodeURIComponent(s));

  // Collection: /v1/workspaces
  if (segs.length === 0) {
    if (method === "POST") return handleCreate(event);
    if (method === "GET") return handleList(event);
    return reply(405, { error: "method not allowed" });
  }

  // /v1/workspaces/join
  if (segs.length === 1 && segs[0] === "join" && method === "POST") {
    return handleJoin(event);
  }

  const id = segs[0];

  // /v1/workspaces/:id
  if (segs.length === 1) {
    if (method === "GET") return handleDetail(event, id);
    return reply(405, { error: "method not allowed" });
  }

  // /v1/workspaces/:id/requests/:user_id/(approve|deny)
  if (segs.length === 4 && segs[1] === "requests" && method === "POST") {
    if (segs[3] === "approve") return handleApprove(event, id, segs[2]);
    if (segs[3] === "deny") return handleDeny(event, id, segs[2]);
  }

  // /v1/workspaces/:id/tokens  and  /v1/workspaces/:id/tokens/:hash
  if (segs[1] === "tokens") {
    if (segs.length === 2 && method === "POST") return handleMintToken(event, id);
    if (segs.length === 3 && method === "DELETE") return handleRevokeToken(event, id, segs[2]);
  }

  return reply(404, { error: `not found: ${method} ${path}` });
}
