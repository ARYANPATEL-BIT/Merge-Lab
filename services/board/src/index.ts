// @mergelab/board-service - GET /v1/board. One read-only snapshot for the
// projector board: branches (with heartbeat status), contracts, and the
// cross-branch drift feed. All projection logic lives in services/resolver's
// assembleBoard so the deployed board and the frontend's demo mode agree.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import {
  ContractSchema,
  DEFAULT_WORKSPACE_ID,
  FindingSchema,
  contractInWorkspace,
  resolveWorkspaceContext,
  type Contract,
  type Finding,
} from "@mergelab/shared";
import { assembleBoard, type Binding } from "@mergelab/resolver";

const TABLE = process.env.TABLE_NAME as string;
const TOKEN = process.env.MERGELAB_TOKEN as string;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

function bearer(event: APIGatewayProxyEventV2): string | undefined {
  const h = event.headers ?? {};
  return h.authorization ?? h.Authorization;
}

async function lookupToken(hash: string): Promise<unknown> {
  const out = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `TOKEN#${hash}`, SK: "WORKSPACE" } }),
  );
  return out.Item;
}

function reply(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

// Every contract row for the repo, any status - assembleBoard decides what the
// board displays and what the rule engine reasons over.
async function allContracts(repo: string): Promise<Contract[]> {
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
    for (const item of out.Items ?? []) contracts.push(ContractSchema.parse(item));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return contracts;
}

// BIND rows: PK=REPO#<repo>, SK=BIND#<branch>#<contract_id>, {symbol, bound_version}.
// Grouped per branch to feed STALE_BINDING.
async function bindingsByBranch(repo: string): Promise<Record<string, Binding[]>> {
  const byBranch: Record<string, Binding[]> = {};
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: { ":pk": `REPO#${repo}`, ":sk": "BIND#" },
        ExclusiveStartKey,
      }),
    );
    for (const item of out.Items ?? []) {
      const sk = typeof item.SK === "string" ? item.SK : "";
      const branch = sk.split("#")[1]; // BIND#<branch>#<contract_id>
      if (!branch || typeof item.symbol !== "string" || typeof item.bound_version !== "number") continue;
      (byBranch[branch] ??= []).push({ symbol: item.symbol, version: item.bound_version });
    }
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return byBranch;
}

// Semantic advisory findings stored by the async semantic Lambda.
async function semanticFindings(repo: string, workspaceId: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: { ":pk": `REPO#${repo}`, ":sk": "FINDING#SEMANTIC#" },
        ExclusiveStartKey,
      }),
    );
    for (const item of out.Items ?? []) {
      const itemWs = item.workspace_id ?? DEFAULT_WORKSPACE_ID;
      if (itemWs === workspaceId && item.finding) {
        const parsed = FindingSchema.safeParse(item.finding);
        if (parsed.success) findings.push(parsed.data);
      }
    }
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return findings;
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const started = Date.now();
  const ctx = await resolveWorkspaceContext(bearer(event), TOKEN, lookupToken);
  if (!ctx) return reply(401, { error: "unauthorized" });

  const repo = (event.queryStringParameters ?? {}).repo;
  if (!repo) return reply(400, { error: "invalid_request", issues: [{ path: ["repo"], message: "required" }] });

  const [allRepoContracts, bindings, advisoryFindings] = await Promise.all([
    allContracts(repo),
    bindingsByBranch(repo),
    semanticFindings(repo, ctx.workspace_id),
  ]);
  const contracts = allRepoContracts.filter((c) => contractInWorkspace(c, ctx.workspace_id));
  const board = assembleBoard(contracts, Date.now(), bindings);

  // Keep only advisory findings whose contracts are still present on the board
  const activeIds = new Set(contracts.map((c) => c.contract_id));
  const validAdvisory = advisoryFindings.filter((f) =>
    f.contract_ids.every((id) => activeIds.has(id)),
  );
  board.findings.push(...validAdvisory);

  console.log(
    JSON.stringify({
      repo,
      route: "GET /v1/board",
      latency_ms: Date.now() - started,
      branches: board.branches.length,
      findings: board.findings.length,
    }),
  );
  return reply(200, board);
};
