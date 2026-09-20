// Board data source. One shape - { board, nowMs } - feeds the UI whether it
// comes from the live registry or the bundled demo fixture. `nowMs` is the
// reference clock the UI measures "reported N ago" and active/dormant against,
// so timestamps and status dots always agree.

import { assembleBoard } from "@mergelab/resolver";
import {
  GetBoardResponseSchema,
  generateJoinCode,
  generateWorkspaceToken,
  type CreateWorkspaceResponse,
  type GetBoardResponse,
  type JoinWorkspaceResponse,
  type MintTokenResponse,
  type WorkspaceDetailResponse,
  type WorkspaceSummary,
} from "@mergelab/shared";
import { buildDemo } from "./demo.js";

const API_URL = import.meta.env.VITE_API_URL;
const API_TOKEN = import.meta.env.VITE_API_TOKEN;
const REPO = import.meta.env.VITE_REPO ?? "acme/app";

/** No API URL configured → render from the bundled demo dataset. */
export const isDemo = !API_URL;
export const repo = REPO;

export interface BoardSnapshot {
  board: GetBoardResponse;
  nowMs: number;
}

// Dormant example is opt-in (?dormant or VITE_DEMO_DORMANT=1); by default every
// demo branch is actively reporting, matching a live demo.
function demoWantsDormant(): boolean {
  if (import.meta.env.VITE_DEMO_DORMANT === "1") return true;
  return new URLSearchParams(window.location.search).has("dormant");
}

export function loadDemo(): BoardSnapshot {
  const { contracts, bindings, nowMs } = buildDemo({ dormant: demoWantsDormant() });
  const board = assembleBoard(contracts, nowMs, bindings);
  // Showcase the Bedrock advisory tier with a sample inferred finding
  board.findings.push({
    rule: "SEMANTIC_DUPLICATE",
    severity: "warn",
    reason:
      "Probable duplicate intent between getUser (dev-a, feat/user-api) and searchUsers (dev-c, feat/search): Both retrieve user entities by identifier or query.",
    contract_ids: ["ct_ua_get_user", "ct_se_search_users"],
    origin: "inferred",
    confidence: 0.88,
  });
  return { board, nowMs };
}

export async function fetchBoard(signal?: AbortSignal): Promise<BoardSnapshot> {
  if (isDemo) return loadDemo();

  const session = getStoredSession();
  const token = session?.token || API_TOKEN;

  const url = new URL("/v1/board", API_URL);
  url.searchParams.set("repo", REPO);
  const res = await fetch(url, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    signal,
  });
  if (!res.ok) throw new Error(`registry returned HTTP ${res.status}`);

  const parsed = GetBoardResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("registry returned an unexpected board shape");
  return { board: parsed.data, nowMs: Date.now() };
}

// ---- Session & Auth -------------------------------------------------------

export interface UserSession {
  token: string;
  user: {
    name: string;
    email: string;
    workspace: string;
  };
  workspace: string;
}

const STORAGE_KEY = "mergelab_session";
const LOCAL_USERS_KEY = "mergelab_local_users";

export function getStoredSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserSession) : null;
  } catch {
    return null;
  }
}

export function setStoredSession(session: UserSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearStoredSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export async function apiSignup(data: {
  name: string;
  email: string;
  password: string;
  workspace?: string;
}): Promise<UserSession> {
  if (API_URL) {
    const res = await fetch(new URL("/v1/auth/signup", API_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `Signup failed (${res.status})`);
    }
    const session = (await res.json()) as UserSession;
    setStoredSession(session);
    return session;
  }

  // Demo / local mode: persist to localStorage
  const email = data.email.toLowerCase().trim();
  const localUsers: Record<string, { name: string; email: string; password: string; workspace: string; token: string }> =
    JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || "{}");

  if (localUsers[email]) {
    throw new Error("An account with this email already exists.");
  }

  const workspace = (data.workspace || email.split("@")[0] || "acme-team").trim();
  const token = `ml_demo_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  const newUser = {
    name: data.name.trim(),
    email,
    password: data.password,
    workspace,
    token,
  };

  localUsers[email] = newUser;
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(localUsers));

  const session: UserSession = {
    token,
    user: { name: newUser.name, email: newUser.email, workspace },
    workspace,
  };
  setStoredSession(session);
  return session;
}

export async function apiLogin(data: { email: string; password: string }): Promise<UserSession> {
  if (API_URL) {
    const res = await fetch(new URL("/v1/auth/login", API_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `Login failed (${res.status})`);
    }
    const session = (await res.json()) as UserSession;
    setStoredSession(session);
    return session;
  }

  // Demo / local mode
  const email = data.email.toLowerCase().trim();
  const localUsers: Record<string, { name: string; email: string; password: string; workspace: string; token: string }> =
    JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || "{}");

  const user = localUsers[email];
  if (!user || user.password !== data.password) {
    throw new Error("Invalid email or password.");
  }

  const session: UserSession = {
    token: user.token,
    user: { name: user.name, email: user.email, workspace: user.workspace },
    workspace: user.workspace,
  };
  setStoredSession(session);
  return session;
}

// ---- Workspaces -----------------------------------------------------------
// The token that authorizes workspace-management calls. A workspace owner/member
// token (from create or approve) takes precedence; otherwise fall back to a
// signed-in session token or the build-time VITE_API_TOKEN.
const WS_TOKEN_KEY = "mergelab_ws_token";

export function getWorkspaceToken(): string | undefined {
  try {
    return localStorage.getItem(WS_TOKEN_KEY) || getStoredSession()?.token || API_TOKEN;
  } catch {
    return API_TOKEN;
  }
}

export function setWorkspaceToken(token: string): void {
  try {
    localStorage.setItem(WS_TOKEN_KEY, token);
  } catch {
    // ignore storage errors
  }
}

async function wsFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getWorkspaceToken();
  const res = await fetch(new URL(path, API_URL), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function createWorkspace(input: {
  name: string;
  display_name: string;
}): Promise<CreateWorkspaceResponse> {
  const out = isDemo
    ? demoCreateWorkspace(input)
    : await wsFetch<CreateWorkspaceResponse>("/v1/workspaces", {
        method: "POST",
        body: JSON.stringify(input),
      });
  // The owner token authorizes subsequent management of this workspace.
  setWorkspaceToken(out.token);
  return out;
}

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  if (isDemo) return demoListWorkspaces();
  const out = await wsFetch<{ workspaces: WorkspaceSummary[] }>("/v1/workspaces");
  return out.workspaces;
}

export async function getWorkspaceDetail(id: string): Promise<WorkspaceDetailResponse> {
  if (isDemo) return demoWorkspaceDetail(id);
  return wsFetch<WorkspaceDetailResponse>(`/v1/workspaces/${encodeURIComponent(id)}`);
}

export async function joinWorkspace(input: {
  join_code: string;
  display_name: string;
}): Promise<JoinWorkspaceResponse> {
  if (isDemo) return demoJoinWorkspace(input);
  return wsFetch<JoinWorkspaceResponse>("/v1/workspaces/join", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function approveRequest(id: string, userId: string): Promise<MintTokenResponse> {
  if (isDemo) return demoApprove(id, userId);
  return wsFetch<MintTokenResponse>(
    `/v1/workspaces/${encodeURIComponent(id)}/requests/${encodeURIComponent(userId)}/approve`,
    { method: "POST" },
  );
}

export async function denyRequest(id: string, userId: string): Promise<void> {
  if (isDemo) return demoDeny(id, userId);
  await wsFetch(
    `/v1/workspaces/${encodeURIComponent(id)}/requests/${encodeURIComponent(userId)}/deny`,
    { method: "POST" },
  );
}

export async function mintWorkspaceToken(id: string, label: string): Promise<MintTokenResponse> {
  if (isDemo) return demoMintToken(id, label);
  return wsFetch<MintTokenResponse>(`/v1/workspaces/${encodeURIComponent(id)}/tokens`, {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export async function revokeWorkspaceToken(id: string, hash: string): Promise<void> {
  if (isDemo) return demoRevokeToken(id, hash);
  await wsFetch(
    `/v1/workspaces/${encodeURIComponent(id)}/tokens/${encodeURIComponent(hash)}`,
    { method: "DELETE" },
  );
}

/** The API base the "Connect your IDE" panel should print. Empty in demo mode. */
export const apiUrl: string = API_URL ?? "";

// ---- Demo-mode workspace store (localStorage) -----------------------------
// So the workspace pages are fully explorable with no backend, mirroring how
// signup/login persist locally in demo mode. Never used when VITE_API_URL is set.

interface DemoWorkspace {
  workspace: CreateWorkspaceResponse["workspace"];
  members: WorkspaceDetailResponse["members"];
  pending_requests: WorkspaceDetailResponse["pending_requests"];
  repos: string[];
  tokens: WorkspaceDetailResponse["tokens"];
}

const DEMO_WS_KEY = "mergelab_ws_demo";

function demoLoad(): Record<string, DemoWorkspace> {
  try {
    return JSON.parse(localStorage.getItem(DEMO_WS_KEY) || "{}") as Record<string, DemoWorkspace>;
  } catch {
    return {};
  }
}

function demoSave(store: Record<string, DemoWorkspace>): void {
  try {
    localStorage.setItem(DEMO_WS_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

function demoId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// Browser-safe stand-in for a token hash. The real registry stores a SHA-256;
// in demo mode the hash is only a display/lookup handle, so a cheap string hash
// avoids pulling node:crypto's createHash into the browser bundle.
function demoHash(token: string): string {
  let h = 0;
  for (let i = 0; i < token.length; i++) h = (Math.imul(31, h) + token.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0") + token.slice(-8);
}

function demoCreateWorkspace(input: { name: string; display_name: string }): CreateWorkspaceResponse {
  const store = demoLoad();
  const workspace_id = demoId("ws");
  const owner_user_id = demoId("usr");
  const token = generateWorkspaceToken();
  const now = new Date().toISOString();
  const workspace = {
    workspace_id,
    name: input.name,
    slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace",
    owner_user_id,
    join_code: generateJoinCode(),
    created_at: now,
  };
  store[workspace_id] = {
    workspace,
    members: [{ user_id: owner_user_id, display_name: input.display_name, role: "owner", joined_at: now }],
    pending_requests: [],
    repos: [],
    tokens: [{ hash: demoHash(token), label: `${input.display_name} (owner)`, created_at: now, revoked: false }],
  };
  demoSave(store);
  return { workspace, token };
}

function demoListWorkspaces(): WorkspaceSummary[] {
  return Object.values(demoLoad()).map((w) => ({
    ...w.workspace,
    member_count: w.members.length,
    repo_count: w.repos.length,
  }));
}

function demoWorkspaceDetail(id: string): WorkspaceDetailResponse {
  const w = demoLoad()[id];
  if (!w) throw new Error("workspace not found");
  return {
    workspace: w.workspace,
    members: w.members,
    pending_requests: w.pending_requests.filter((r) => r.status === "pending"),
    repos: w.repos,
    tokens: w.tokens,
  };
}

function demoJoinWorkspace(input: { join_code: string; display_name: string }): JoinWorkspaceResponse {
  const store = demoLoad();
  const code = input.join_code.trim().toUpperCase();
  const w = Object.values(store).find((x) => x.workspace.join_code === code);
  if (!w) throw new Error("unknown join code");
  const user_id = demoId("usr");
  const request = {
    user_id,
    display_name: input.display_name,
    requested_at: new Date().toISOString(),
    status: "pending" as const,
  };
  w.pending_requests.push(request);
  demoSave(store);
  return { workspace_id: w.workspace.workspace_id, workspace_name: w.workspace.name, request };
}

function demoApprove(id: string, userId: string): MintTokenResponse {
  const store = demoLoad();
  const w = store[id];
  if (!w) throw new Error("workspace not found");
  const req = w.pending_requests.find((r) => r.user_id === userId);
  if (!req) throw new Error("join request not found");
  req.status = "approved";
  const now = new Date().toISOString();
  w.members.push({ user_id: userId, display_name: req.display_name, role: "member", joined_at: now });
  const token = generateWorkspaceToken();
  const summary = { hash: demoHash(token), label: req.display_name, created_at: now, revoked: false };
  w.tokens.push(summary);
  demoSave(store);
  return { token, summary };
}

function demoDeny(id: string, userId: string): void {
  const store = demoLoad();
  const w = store[id];
  if (!w) return;
  const req = w.pending_requests.find((r) => r.user_id === userId);
  if (req) req.status = "denied";
  demoSave(store);
}

function demoMintToken(id: string, label: string): MintTokenResponse {
  const store = demoLoad();
  const w = store[id];
  if (!w) throw new Error("workspace not found");
  const token = generateWorkspaceToken();
  const summary = { hash: demoHash(token), label, created_at: new Date().toISOString(), revoked: false };
  w.tokens.push(summary);
  demoSave(store);
  return { token, summary };
}

function demoRevokeToken(id: string, hash: string): void {
  const store = demoLoad();
  const w = store[id];
  if (!w) return;
  const t = w.tokens.find((x) => x.hash === hash);
  if (t) t.revoked = true;
  demoSave(store);
}

