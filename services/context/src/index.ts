// @mergelab/context - GET /v1/context. Returns the active teammate contracts
// for a repo, dropping the caller's own owner. Read-only.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { ContractSchema, GetContextRequestSchema, type Contract } from "@mergelab/shared";

const TABLE = process.env.TABLE_NAME as string;
const TOKEN = process.env.MERGELAB_TOKEN as string;
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

  const q = event.queryStringParameters ?? {};
  const parsed = GetContextRequestSchema.safeParse({
    repo: q.repo,
    branch: q.branch,
    exclude_owner: q.exclude_owner,
  });
  if (!parsed.success) return reply(400, { error: "invalid_request", issues: parsed.error.issues });

  const { repo, branch, exclude_owner } = parsed.data;
  const all = await activeContracts(repo);
  const contracts = exclude_owner ? all.filter((c) => c.owner !== exclude_owner) : all;

  console.log(
    JSON.stringify({ repo, branch: branch ?? null, route: "GET /v1/context", latency_ms: Date.now() - started }),
  );
  return reply(200, { contracts });
};
