import { beforeEach, describe, expect, it } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { Contract } from "@mergelab/shared";
import {
  compareDeclarations,
  handler,
  parseModelResponse,
  redactForSemanticCheck,
  runSemanticAnalysis,
} from "./index.js";

const bedrockMock = mockClient(BedrockRuntimeClient);
const ddbMock = mockClient(DynamoDBDocumentClient);

const makeContract = (overrides: Partial<Contract> = {}): Contract => {
  const symbol = overrides.symbol ?? "formatDate";
  return {
    contract_id: "ct_1",
    repo: "acme/app",
    branch: "feat/date-a",
    owner: "alice",
    version: 1,
    status: "implemented",
    kind: "function",
    symbol,
    signature: `${symbol}(d: Date) -> string`,
    shape: { d: "Date" },
    provides: [symbol],
    consumes: [],
    deps: [],
    source_ref: "src/date.ts:1",
    origin: "working_tree",
    confidence: 1,
    declared_at: new Date().toISOString(),
    ...overrides,
  };
};

describe("services/semantic", () => {
  beforeEach(() => {
    bedrockMock.reset();
    ddbMock.reset();
    process.env.TABLE_NAME = "mergelab";
  });

  describe("parseModelResponse", () => {
    it("parses clean JSON response", () => {
      const raw = JSON.stringify({
        duplicate: true,
        confidence: 0.92,
        reason: "Both format a Date into a string display format",
      });
      const res = parseModelResponse(raw);
      expect(res).toEqual({
        duplicate: true,
        confidence: 0.92,
        reason: "Both format a Date into a string display format",
      });
    });

    it("parses JSON wrapped in markdown ticks", () => {
      const raw = "```json\n" + JSON.stringify({
        duplicate: false,
        confidence: 0.8,
        reason: "Different purposes",
      }) + "\n```";
      const res = parseModelResponse(raw);
      expect(res?.duplicate).toBe(false);
      expect(res?.confidence).toBe(0.8);
    });

    it("returns null for malformed output", () => {
      expect(parseModelResponse("I think they might be duplicates")).toBeNull();
      expect(parseModelResponse("{ invalid json")).toBeNull();
      expect(parseModelResponse(JSON.stringify({ duplicate: "yes" }))).toBeNull();
    });
  });

  describe("redactForSemanticCheck", () => {
    it("extracts only names, signatures and shape field names", () => {
      const contract = makeContract({
        shape: { id: "string", created_at: "string" },
        source_ref: "src/secret/private.ts:42",
      });
      const redacted = redactForSemanticCheck(contract);
      expect(redacted).toEqual({
        kind: "function",
        symbol: "formatDate",
        signature: "formatDate(d: Date) -> string",
        shape_fields: ["id", "created_at"],
      });
      // Ensure no source code or source_ref leaked
      expect((redacted as Record<string, unknown>).source_ref).toBeUndefined();
    });
  });

  describe("compareDeclarations", () => {
    it("calls Bedrock and parses response", async () => {
      const c1 = makeContract({ symbol: "formatDate" });
      const c2 = makeContract({
        contract_id: "ct_2",
        symbol: "toDisplayDate",
        branch: "feat/date-b",
        owner: "bob",
      });

      bedrockMock.on(InvokeModelCommand).resolves({
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [
              {
                text: JSON.stringify({
                  duplicate: true,
                  confidence: 0.9,
                  reason: "Both format dates for display",
                }),
              },
            ],
          }),
        ) as any,
      });

      const res = await compareDeclarations(c1, c2);
      expect(res).toEqual({
        duplicate: true,
        confidence: 0.9,
        reason: "Both format dates for display",
      });
    });

    it("fails open and returns null when Bedrock throws", async () => {
      const c1 = makeContract({ symbol: "formatDate" });
      const c2 = makeContract({
        contract_id: "ct_2",
        symbol: "toDisplayDate",
        branch: "feat/date-b",
      });

      bedrockMock.on(InvokeModelCommand).rejects(new Error("Bedrock rate exceeded"));

      const res = await compareDeclarations(c1, c2);
      expect(res).toBeNull();
    });
  });

  describe("runSemanticAnalysis", () => {
    it("emits an inferred finding when duplicate is detected with high confidence", async () => {
      const c1 = makeContract({
        contract_id: "ct_1",
        symbol: "formatDate",
        branch: "feat/a",
      });
      const c2 = makeContract({
        contract_id: "ct_2",
        symbol: "toDisplayDate",
        branch: "feat/b",
        owner: "bob",
      });

      // DynamoDB returns active contracts
      ddbMock.on(QueryCommand).resolves({
        Items: [c1, c2],
      });
      // Cache miss
      ddbMock.on(GetCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      // Bedrock returns duplicate
      bedrockMock.on(InvokeModelCommand).resolves({
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [
              {
                text: JSON.stringify({
                  duplicate: true,
                  confidence: 0.88,
                  reason: "Both convert a date object into formatted text",
                }),
              },
            ],
          }),
        ) as any,
      });

      const findings = await runSemanticAnalysis({
        repo: "acme/app",
        contract_ids: ["ct_1"],
      });

      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("SEMANTIC_DUPLICATE");
      expect(findings[0].severity).toBe("warn");
      expect(findings[0].origin).toBe("inferred");
      expect(findings[0].confidence).toBe(0.88);
      expect(findings[0].contract_ids).toEqual(["ct_1", "ct_2"]);
    });

    it("uses cached result and skips Bedrock call when pair is cached", async () => {
      const c1 = makeContract({ contract_id: "ct_1", symbol: "getUser", branch: "feat/a" });
      const c2 = makeContract({ contract_id: "ct_2", symbol: "fetchUserById", branch: "feat/b", owner: "bob" });

      ddbMock.on(QueryCommand).resolves({
        Items: [c1, c2],
      });
      // Cache hit
      ddbMock.on(GetCommand).resolves({
        Item: {
          duplicate: true,
          confidence: 0.95,
          reason: "Both retrieve user by ID",
        },
      });
      ddbMock.on(PutCommand).resolves({});

      const findings = await runSemanticAnalysis({ repo: "acme/app" });

      expect(findings).toHaveLength(1);
      expect(findings[0].confidence).toBe(0.95);
      // Bedrock must NOT be called on cache hit
      expect(bedrockMock.calls()).toHaveLength(0);
    });

    it("does not emit finding when confidence is below threshold", async () => {
      const c1 = makeContract({ contract_id: "ct_1", symbol: "calc", branch: "feat/a" });
      const c2 = makeContract({ contract_id: "ct_2", symbol: "compute", branch: "feat/b", owner: "bob" });

      ddbMock.on(QueryCommand).resolves({
        Items: [c1, c2],
      });
      ddbMock.on(GetCommand).resolves({
        Item: {
          duplicate: true,
          confidence: 0.4, // Below 0.7 threshold
          reason: "Unclear similarity",
        },
      });

      const findings = await runSemanticAnalysis({ repo: "acme/app" });
      expect(findings).toHaveLength(0);
    });
  });

  describe("handler", () => {
    it("handles direct async payload successfully", async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      const res = (await handler({ repo: "acme/app" })) as { statusCode: number };
      expect(res.statusCode).toBe(200);
    });

    it("handles HTTP event and returns 200", async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      const res = (await handler({
        body: JSON.stringify({ repo: "acme/app" }),
        isBase64Encoded: false,
      } as any)) as { statusCode: number };
      expect(res.statusCode).toBe(200);
    });

    it("fails open with 200 and empty findings on unexpected error", async () => {
      ddbMock.on(QueryCommand).rejects(new Error("DynamoDB unreachable"));
      const res = (await handler({ repo: "acme/app" })) as {
        statusCode: number;
        body?: string;
      };
      expect(res.statusCode).toBe(200);
      if (typeof res.body === "string") {
        expect(JSON.parse(res.body)).toEqual({ findings: [] });
      }
    });
  });
});
