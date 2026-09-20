// @mergelab/auth-service - POST /v1/auth/signup and POST /v1/auth/login.
// Manages workspace accounts and developer access tokens in DynamoDB.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import {
  AuthResponseSchema,
  LoginRequestSchema,
  SignupRequestSchema,
  type AuthResponse,
} from "@mergelab/shared";

const TABLE = process.env.TABLE_NAME || "mergelab";

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

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 32).toString("hex");
}

function verifyPassword(password: string, salt: string, hash: string): boolean {
  const attempt = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  if (attempt.length !== expected.length) return false;
  return timingSafeEqual(attempt, expected);
}

function generateToken(): string {
  return `ml_live_${randomBytes(24).toString("hex")}`;
}

async function handleSignup(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody(event) || "{}");
  } catch {
    return reply(400, { error: "malformed JSON body" });
  }

  const parsed = SignupRequestSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return reply(400, { error: "validation failed", issues: parsed.error.issues });
  }

  const { name, password } = parsed.data;
  const email = parsed.data.email.toLowerCase().trim();
  const workspace = (parsed.data.workspace || email.split("@")[0] || "default-ws").trim();

  // Check if user already exists
  const existing = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${email}`, SK: "PROFILE" },
    }),
  );

  if (existing.Item) {
    return reply(409, { error: "an account with this email already exists" });
  }

  const salt = randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  const token = generateToken();
  const now = new Date().toISOString();

  // 1. User Profile record
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `USER#${email}`,
        SK: "PROFILE",
        name,
        email,
        workspace,
        salt,
        password_hash: passwordHash,
        token,
        created_at: now,
      },
    }),
  );

  // 2. Workspace Member record (PRD 11.2 single-table design)
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `WS#${workspace}`,
        SK: `USER#${email}`,
        display_name: name,
        email,
        role: "owner",
        joined_at: now,
      },
    }),
  );

  // 3. Token lookup record for CLI/daemon authorization
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `TOKEN#${token}`,
        SK: "SESSION",
        email,
        workspace,
        created_at: now,
      },
    }),
  );

  const response: AuthResponse = {
    token,
    user: { name, email, workspace },
    workspace,
  };

  return reply(201, AuthResponseSchema.parse(response));
}

async function handleLogin(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody(event) || "{}");
  } catch {
    return reply(400, { error: "malformed JSON body" });
  }

  const parsed = LoginRequestSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return reply(400, { error: "validation failed", issues: parsed.error.issues });
  }

  const { password } = parsed.data;
  const email = parsed.data.email.toLowerCase().trim();

  const userRecord = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${email}`, SK: "PROFILE" },
    }),
  );

  if (!userRecord.Item) {
    return reply(401, { error: "invalid email or password" });
  }

  const item = userRecord.Item;
  const valid = verifyPassword(password, item.salt, item.password_hash);
  if (!valid) {
    return reply(401, { error: "invalid email or password" });
  }

  const token = item.token || generateToken();

  const response: AuthResponse = {
    token,
    user: {
      name: item.name || email.split("@")[0],
      email: item.email,
      workspace: item.workspace || "default-ws",
    },
    workspace: item.workspace || "default-ws",
  };

  return reply(200, AuthResponseSchema.parse(response));
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext?.http?.method || "";
  const path = event.rawPath || "";

  if (method === "OPTIONS") {
    return reply(200, { ok: true });
  }

  if (method === "POST" && path.endsWith("/signup")) {
    return handleSignup(event);
  }

  if (method === "POST" && path.endsWith("/login")) {
    return handleLogin(event);
  }

  return reply(404, { error: `not found: ${method} ${path}` });
}
