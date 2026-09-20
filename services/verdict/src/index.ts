// @mergelab/verdict - POST /v1/verdict. Runs the deterministic rule engine
// (services/resolver) against teammate contracts + branch bindings. No LLM.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import {
  ContractSchema,
  PostVerdictRequestSchema,
  contractInWorkspace,
  resolveWorkspaceContext,
  type Contract,
  type Finding,
  type VerdictDecision,
} from "@mergelab/shared";
import { runRules, type Binding } from "@mergelab/resolver";

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

async function queryActiveContracts(repo: string): Promise<Contract[]> {
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

async function activeContracts(repo: string): Promise<Contract[]> {
  const contracts = await queryActiveContracts(repo);
  if (contracts.length > 0) return contracts;
  const altRepo = repo.endsWith(".git") ? repo.slice(0, -4) : `${repo}.git`;
  return queryActiveContracts(altRepo);
}

// BIND rows: PK=REPO#<repo>, SK=BIND#<branch>#<contract_id>, {symbol, bound_version}.
async function branchBindings(repo: string, branch: string): Promise<Binding[]> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `REPO#${repo}`, ":sk": `BIND#${branch}#` },
    }),
  );
  const bindings: Binding[] = [];
  for (const item of out.Items ?? []) {
    if (typeof item.symbol === "string" && typeof item.bound_version === "number") {
      bindings.push({ symbol: item.symbol, version: item.bound_version });
    }
  }
  return bindings;
}

function decide(findings: Finding[]): VerdictDecision {
  if (findings.some((f) => f.severity === "block")) return "block";
  if (findings.some((f) => f.severity === "warn")) return "warn";
  return "allow";
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
  const parsed = PostVerdictRequestSchema.safeParse(payload);
  if (!parsed.success) return reply(400, { error: "invalid_request", issues: parsed.error.issues });

  const { repo, branch, owner, declarations } = parsed.data;
  // active = other developers' contracts in this workspace (the context this writer sees).
  const active = (await activeContracts(repo))
    .filter((c) => contractInWorkspace(c, ctx.workspace_id))
    .filter((c) => c.owner !== owner);
  const bindings = await branchBindings(repo, branch);

  const findings = runRules(declarations, active, bindings);
  const verdict = decide(findings);

  console.log(
    JSON.stringify({ repo, branch, route: "POST /v1/verdict", latency_ms: Date.now() - started, verdict }),
  );
  return reply(200, { verdict, findings });
};
