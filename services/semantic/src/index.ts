// @mergelab/semantic-service - Asynchronous advisory semantic duplicate analysis.
// Invoked after ingest to compare new function/type declarations against active
// declarations on other branches that passed all six deterministic rules.
//
// Hard constraints:
// - NEVER in the /v1/verdict path. The 300ms budget is not negotiable.
// - Severity is always 'warn'. Never 'block'.
// - Fail-open: on any Bedrock timeout, error, or parse failure, log and return no findings.
// - Names, signatures, and shape field names only. Never source code or literals.
// - Cache by pair of shape hashes.

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import {
  ContractSchema,
  DEFAULT_WORKSPACE_ID,
  SemanticComparisonResultSchema,
  contractInWorkspace,
  shapeHash,
  type Contract,
  type Finding,
  type SemanticComparisonResult,
} from "@mergelab/shared";
import { findSemanticCandidates } from "@mergelab/resolver";

const TABLE = process.env.TABLE_NAME as string;
const REGION = process.env.BEDROCK_REGION || process.env.AWS_REGION || "ap-south-1";
const MODEL_ID =
  process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0";
const CONFIDENCE_THRESHOLD = Number.parseFloat(
  process.env.SEMANTIC_CONFIDENCE_THRESHOLD || "0.7",
);
const ACTIVE = new Set(["declared", "implementing", "implemented"]);

export const bedrock = new BedrockRuntimeClient({ region: REGION });
export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export interface SemanticInvocationPayload {
  repo: string;
  workspace_id?: string;
  contract_ids?: string[];
}

/** Redact declaration to names, signatures and shape fields only. Never source code. */
export function redactForSemanticCheck(c: Contract) {
  return {
    kind: c.kind,
    symbol: c.symbol,
    signature: c.signature,
    shape_fields: c.shape ? Object.keys(c.shape) : undefined,
  };
}

/** Stable sorted pair key from two shape hashes. */
export function hashPairKey(h1: string, h2: string): [string, string] {
  return h1 < h2 ? [h1, h2] : [h2, h1];
}

/** Defensive parser for Bedrock model output. */
export function parseModelResponse(raw: string): SemanticComparisonResult | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const valid = SemanticComparisonResultSchema.safeParse(parsed);
    return valid.success ? valid.data : null;
  } catch {
    return null;
  }
}

/** Query active contracts for a repo from DynamoDB. */
async function loadActiveContracts(
  repo: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<Contract[]> {
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
      if (ACTIVE.has(c.status) && contractInWorkspace(c, workspaceId)) {
        contracts.push(c);
      }
    }
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return contracts;
}

/** Call Claude 3 Haiku on Bedrock to compare two declarations. Fail-open. */
export async function compareDeclarations(
  c1: Contract,
  c2: Contract,
): Promise<SemanticComparisonResult | null> {
  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 256,
    temperature: 0.0,
    messages: [
      {
        role: "user",
        content: `Compare these two software declarations from different branches of the same codebase to determine if they represent duplicate intent (developers independently implementing the same functionality under different names):

Declaration 1:
${JSON.stringify(redactForSemanticCheck(c1), null, 2)}

Declaration 2:
${JSON.stringify(redactForSemanticCheck(c2), null, 2)}

Respond ONLY with a valid JSON object with the exact keys:
{
  "duplicate": boolean,
  "confidence": number between 0.0 and 1.0,
  "reason": "short explanation of why they are or are not duplicate in intent"
}`,
      },
    ],
  };

  try {
    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(payload),
    });

    const response = await bedrock.send(command);
    const bodyStr = new TextDecoder().decode(response.body);
    const resObj = JSON.parse(bodyStr);
    const text =
      resObj?.content?.[0]?.text ||
      (typeof resObj?.completion === "string" ? resObj.completion : "");
    return parseModelResponse(text);
  } catch (err) {
    console.warn("Bedrock comparison failed, failing open:", err);
    return null;
  }
}

/**
 * Execute semantic duplicate check for a repo.
 * Checks cache first; invokes Bedrock only on cache miss.
 */
export async function runSemanticAnalysis(
  payload: SemanticInvocationPayload,
): Promise<Finding[]> {
  const { repo, contract_ids } = payload;
  const workspace_id = payload.workspace_id ?? DEFAULT_WORKSPACE_ID;
  const active = await loadActiveContracts(repo, workspace_id);
  if (active.length < 2) return [];

  // If specific contract_ids were provided (e.g. newly ingested), focus on them;
  // otherwise evaluate all active contracts.
  const targetContracts =
    contract_ids && contract_ids.length > 0
      ? active.filter((c) => contract_ids.includes(c.contract_id))
      : active;

  if (targetContracts.length === 0) return [];

  const candidates = findSemanticCandidates(targetContracts, active);
  const findings: Finding[] = [];
  const seenPairs = new Set<string>();

  for (const { incoming, target } of candidates) {
    const c1 = incoming as Contract;
    const c2 = target;

    const h1 = shapeHash(c1);
    const h2 = shapeHash(c2);
    const [minHash, maxHash] = hashPairKey(h1, h2);
    const pairKey = `${minHash}#${maxHash}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    // 1. Check cache in DynamoDB
    let cachedResult: SemanticComparisonResult | null = null;
    try {
      const cached = await ddb.send(
        new GetCommand({
          TableName: TABLE,
          Key: {
            PK: `REPO#${repo}`,
            SK: `SEMANTIC_CACHE#${minHash}#${maxHash}`,
          },
        }),
      );
      if (cached.Item) {
        cachedResult = {
          duplicate: Boolean(cached.Item.duplicate),
          confidence: Number(cached.Item.confidence),
          reason: String(cached.Item.reason),
        };
      }
    } catch (err) {
      console.warn("Failed to check semantic cache:", err);
    }

    const result =
      cachedResult ?? (await compareDeclarations(c1, c2));

    // 2. If new comparison, cache it
    if (!cachedResult && result) {
      try {
        await ddb.send(
          new PutCommand({
            TableName: TABLE,
            Item: {
              PK: `REPO#${repo}`,
              SK: `SEMANTIC_CACHE#${minHash}#${maxHash}`,
              hash1: minHash,
              hash2: maxHash,
              duplicate: result.duplicate,
              confidence: result.confidence,
              reason: result.reason,
              evaluated_at: new Date().toISOString(),
            },
          }),
        );
      } catch (err) {
        console.warn("Failed to write semantic cache:", err);
      }
    }

    // 3. Emit finding if duplicate with high confidence
    if (result && result.duplicate && result.confidence >= CONFIDENCE_THRESHOLD) {
      const finding: Finding = {
        rule: "SEMANTIC_DUPLICATE",
        severity: "warn",
        reason: `Probable duplicate intent between ${c1.symbol} (${c1.owner}, ${c1.branch}) and ${c2.symbol} (${c2.owner}, ${c2.branch}): ${result.reason}`,
        contract_ids: [c1.contract_id, c2.contract_id],
        origin: "inferred",
        confidence: result.confidence,
      };
      findings.push(finding);

      // Persist finding to DynamoDB so board can query it
      try {
        await ddb.send(
          new PutCommand({
            TableName: TABLE,
            Item: {
              PK: `REPO#${repo}`,
              SK: `FINDING#SEMANTIC#${minHash}#${maxHash}`,
              entity: "SEMANTIC_FINDING",
              finding,
              contract_ids: [c1.contract_id, c2.contract_id],
              workspace_id,
              created_at: new Date().toISOString(),
            },
          }),
        );
      } catch (err) {
        console.warn("Failed to persist semantic finding:", err);
      }
    }
  }

  return findings;
}

/** Lambda entrypoint. Supports direct async invocation and HTTP POST /v1/semantic. */
export const handler = async (
  event: APIGatewayProxyEventV2 | SemanticInvocationPayload,
): Promise<APIGatewayProxyResultV2> => {
  const started = Date.now();

  try {
    let payload: SemanticInvocationPayload;

    if ("repo" in event && typeof event.repo === "string") {
      payload = event as SemanticInvocationPayload;
    } else {
      const httpEvent = event as APIGatewayProxyEventV2;
      const raw = httpEvent.body
        ? httpEvent.isBase64Encoded
          ? Buffer.from(httpEvent.body, "base64").toString("utf8")
          : httpEvent.body
        : "{}";
      payload = JSON.parse(raw);
    }

    if (!payload.repo) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "repo is required" }),
      };
    }

    const findings = await runSemanticAnalysis(payload);

    console.log(
      JSON.stringify({
        repo: payload.repo,
        route: "SEMANTIC_ANALYSIS",
        latency_ms: Date.now() - started,
        findings_count: findings.length,
      }),
    );

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ findings }),
    };
  } catch (err) {
    console.warn("Semantic handler failed, failing open with zero findings:", err);
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ findings: [] }),
    };
  }
};
