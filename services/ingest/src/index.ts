// @handshake/ingest — POST /v1/declarations. Validates the request with the
// shared schema, resolves versioning via services/resolver, and persists
// Contracts. Does NOT reimplement validation, resolution, or versioning.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { ContractSchema, PostDeclarationsRequestSchema, type Contract } from "@handshake/shared";
import { resolve } from "@handshake/resolver";
import { ulid } from "ulid";

const TABLE = process.env.TABLE_NAME as string;
const TOKEN = process.env.HANDSHAKE_TOKEN as string;
const ACTIVE = new Set(["declared", "implementing", "implemented"]);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

function bearer(event: APIGatewayProxyEventV2): string | undefined {
  const h = event.headers ?? {};
  return h.authorization ?? h.Authorization;
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
  if (bearer(event) !== `Bearer ${TOKEN}`) return reply(401, { error: "unauthorized" });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody(event) || "null");
  } catch {
    return reply(400, { error: "invalid_json" });
  }
  const parsed = PostDeclarationsRequestSchema.safeParse(payload);
  if (!parsed.success) return reply(400, { error: "invalid_request", issues: parsed.error.issues });

  const { repo, branch, owner, declarations } = parsed.data;
  const { resolutions, superseded } = resolve(declarations, await activeContracts(repo));

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
    };
    contracts.push(contract);
    writes.push(ddb.send(new PutCommand({ TableName: TABLE, Item: contractItem(contract) })));
  }
  for (const prior of superseded) {
    writes.push(ddb.send(new PutCommand({ TableName: TABLE, Item: contractItem(prior) })));
  }
  await Promise.all(writes);

  console.log(
    JSON.stringify({ repo, branch, route: "POST /v1/declarations", latency_ms: Date.now() - started }),
  );
  return reply(200, { contracts });
};
