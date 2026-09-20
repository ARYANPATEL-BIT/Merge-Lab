// Handler tests for @mergelab/auth-service. aws-sdk-client-mock stands in for
// DynamoDB. Asserts signup and login behavior.

import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";

const TABLE = "mergelab-test";
process.env.TABLE_NAME = TABLE;

const ddbMock = mockClient(DynamoDBDocumentClient);
const { handler } = await import("./index.js");

async function invoke(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  return (await handler(event)) as APIGatewayProxyStructuredResultV2;
}

function makeEvent(path: string, body: unknown): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: `POST ${path}`,
    rawPath: path,
    rawQueryString: "",
    headers: { "content-type": "application/json" },
    requestContext: {
      accountId: "123",
      apiId: "api",
      domainName: "api.example.com",
      domainPrefix: "api",
      http: {
        method: "POST",
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "agent",
      },
      requestId: "req",
      routeKey: `POST ${path}`,
      stage: "$default",
      time: "2026-09-20T12:00:00Z",
      timeEpoch: 0,
    },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

describe("@mergelab/auth-service", () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it("POST /v1/auth/signup - creates account and returns token", async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    ddbMock.on(PutCommand).resolves({});

    const res = await invoke(
      makeEvent("/v1/auth/signup", {
        name: "Ada Lovelace",
        email: "ada@example.com",
        password: "secretpassword",
        workspace: "acme-team",
      }),
    );

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body || "{}");
    expect(body.user.name).toBe("Ada Lovelace");
    expect(body.user.email).toBe("ada@example.com");
    expect(body.workspace).toBe("acme-team");
    expect(body.token).toMatch(/^ml_live_/);
  });

  it("POST /v1/auth/signup - returns 409 if user already exists", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { PK: "USER#ada@example.com", SK: "PROFILE" },
    });

    const res = await invoke(
      makeEvent("/v1/auth/signup", {
        name: "Ada Lovelace",
        email: "ada@example.com",
        password: "secretpassword",
      }),
    );

    expect(res.statusCode).toBe(409);
  });

  it("POST /v1/auth/login - validates password and returns token", async () => {
    const { scryptSync } = await import("node:crypto");
    const salt = "deadbeef";
    const hash = scryptSync("secretpassword", salt, 32).toString("hex");

    ddbMock.on(GetCommand).resolves({
      Item: {
        PK: "USER#ada@example.com",
        SK: "PROFILE",
        name: "Ada Lovelace",
        email: "ada@example.com",
        workspace: "acme-team",
        salt,
        password_hash: hash,
        token: "ml_live_existingtoken",
      },
    });

    const res = await invoke(
      makeEvent("/v1/auth/login", {
        email: "ada@example.com",
        password: "secretpassword",
      }),
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body || "{}");
    expect(body.token).toBe("ml_live_existingtoken");
    expect(body.user.name).toBe("Ada Lovelace");
  });

  it("POST /v1/auth/login - returns 401 on wrong password", async () => {
    const { scryptSync } = await import("node:crypto");
    const salt = "deadbeef";
    const hash = scryptSync("secretpassword", salt, 32).toString("hex");

    ddbMock.on(GetCommand).resolves({
      Item: {
        PK: "USER#ada@example.com",
        SK: "PROFILE",
        salt,
        password_hash: hash,
      },
    });

    const res = await invoke(
      makeEvent("/v1/auth/login", {
        email: "ada@example.com",
        password: "wrongpassword",
      }),
    );

    expect(res.statusCode).toBe(401);
  });
});
