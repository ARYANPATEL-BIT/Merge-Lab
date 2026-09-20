// @mergelab/ingest - POST /v1/declarations. Validates the request with the
// shared schema, resolves versioning via services/resolver, and persists
// Contracts. Does NOT reimplement validation, resolution, or versioning.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import {
  ContractSchema,
  DEFAULT_WORKSPACE_ID,
  PostDeclarationsRequestSchema,
  contractInWorkspace,
  resolveWorkspaceContext,
  type Contract,
} from "@mergelab/shared";
import { resolve } from "@mergelab/resolver";
import { ulid } from "ulid";

const TABLE = process.env.TABLE_NAME as string;
const TOKEN = process.env.MERGELAB_TOKEN as string;
const SEMANTIC_FUNCTION = process.env.SEMANTIC_FUNCTION_NAME;
const ACTIVE = new Set(["declared", "implementing", "implemented"]);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const lambda = new LambdaClient({});

function bearer(event: APIGatewayProxyEventV2): string | undefined {
  const h = event.headers ?? {};
  return h.authorization ?? h.Authorization;
}

// Global token -> workspace lookup. Checks SHA-256 hash in TOKEN# rows (SK: WORKSPACE or SESSION)
// with fallback to plaintext token.
async function lookupToken(hash: string, token?: string): Promise<unknown> {
  const res1 = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `TOKEN#${hash}`, SK: "WORKSPACE" } }),
  );
  if (res1.Item) return res1.Item;

  const res2 = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `TOKEN#${hash}`, SK: "SESSION" } }),
  );
  if (res2.Item) return res2.Item;

  if (token) {
    const res3 = await ddb.send(
      new GetCommand({ TableName: TABLE, Key: { PK: `TOKEN#${token}`, SK: "SESSION" } }),
    );
    if (res3.Item) return res3.Item;

    const res4 = await ddb.send(
      new GetCommand({ TableName: TABLE, Key: { PK: `TOKEN#${token}`, SK: "WORKSPACE" } }),
    );
    if (res4.Item) return res4.Item;
  }

  return undefined;
}

function reply(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

function rawBody(event: APIGatewayProxyEventV2): string {
  if (!event.body) return "";
  return event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
}

function contractItem(c: Contract): Record<string, unknown> {
  return {
    PK: `REPO#${c.repo}`,
    SK: `CONTRACT#${c.symbol}#v${c.version}`,
    GSI1PK: `REPO#${c.repo}#BRANCH#${c.branch}`,
    GSI1SK: `CONTRACT#${c.symbol}#v${c.version}`,
    entity: "CONTRACT",
    ...c,
  };
}

async function activeContracts(repo: string): Promise<Contract[]> {
  const contracts: Contract[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: { ":pk": `REPO#${repo}`, ":sk": "CONTRACT#" },
        ExclusiveStartKey,
      }),
    );
    for (const item of out.Items ?? []) {
      const c = ContractSchema.parse(item);
      if (ACTIVE.has(c.status)) contracts.push(c);
    }
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return contracts;
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const started = Date.now();
  const ctx = await resolveWorkspaceContext(bearer(event), TOKEN, lookupToken);
  if (!ctx) return reply(401, { error: "unauthorized" });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody(event) || "null");
  } catch {
    return reply(400, { error: "invalid_json" });
  }
  const parsed = PostDeclarationsRequestSchema.safeParse(payload);
  if (!parsed.success) return reply(400, { error: "invalid_request", issues: parsed.error.issues });

  const { repo, branch, owner, declarations } = parsed.data;
  // Version resolution only sees prior contracts in the caller's workspace, so
  // two workspaces sharing a repo name never collide on versions.
  const priors = (await activeContracts(repo)).filter((c) => contractInWorkspace(c, ctx.workspace_id));
  const { resolutions, superseded } = resolve(declarations, priors);

  // A real workspace stamps workspace_id onto its rows; the legacy/default
  // caller writes exactly what it always did (no workspace_id, no extra rows).
  const scoped = ctx.workspace_id !== DEFAULT_WORKSPACE_ID;

  const contracts: Contract[] = [];
  const writes: Promise<unknown>[] = [];

  for (const r of resolutions) {
    if (r.action === "unchanged") {
      if (r.prior) contracts.push(r.prior);
      continue;
    }
    const contract: Contract = {
      ...r.declaration,
      contract_id: ulid(),
      repo,
      branch,
      owner,
      version: r.version,
      status: "declared",
      ...(r.supersedes ? { supersedes: r.supersedes } : {}),
      declared_at: new Date().toISOString(),
      ...(scoped ? { workspace_id: ctx.workspace_id } : {}),
    };
    contracts.push(contract);
    writes.push(ddb.send(new PutCommand({ TableName: TABLE, Item: contractItem(contract) })));
  }
  for (const prior of superseded) {
    writes.push(ddb.send(new PutCommand({ TableName: TABLE, Item: contractItem(prior) })));
  }
  // Record repo membership so a workspace's detail view can list its repos.
  // Idempotent; only for real workspaces (the default caller tracks no repos).
  if (scoped && contracts.length > 0) {
    writes.push(
      ddb.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            PK: `WS#${ctx.workspace_id}`,
            SK: `REPO#${repo}`,
            entity: "WORKSPACE_REPO",
            repo,
            last_seen: new Date().toISOString(),
          },
        }),
      ),
    );
  }
  await Promise.all(writes);

  // Trigger advisory semantic duplicate analysis asynchronously (fire-and-forget).
  // Fail-open: any trigger failure must never affect Tier 1 ingest.
  if (SEMANTIC_FUNCTION && contracts.length > 0) {
    lambda
      .send(
        new InvokeCommand({
          FunctionName: SEMANTIC_FUNCTION,
          InvocationType: "Event",
          Payload: Buffer.from(
            JSON.stringify({
              repo,
              workspace_id: ctx.workspace_id,
              contract_ids: contracts.map((c) => c.contract_id),
            }),
          ),
        }),
      )
      .catch((err) => {
        console.warn("Failed to trigger semantic Lambda, failing open:", err);
      });
  }

  console.log(
    JSON.stringify({ repo, branch, route: "POST /v1/declarations", latency_ms: Date.now() - started }),
  );
  return reply(200, { contracts });
};
