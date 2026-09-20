// Board data source. One shape - { board, nowMs } - feeds the UI whether it
// comes from the live registry or the bundled demo fixture. `nowMs` is the
// reference clock the UI measures "reported N ago" and active/dormant against,
// so timestamps and status dots always agree.

import { assembleBoard } from "@mergelab/resolver";
import { GetBoardResponseSchema, type GetBoardResponse } from "@mergelab/shared";
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
  return { board: assembleBoard(contracts, nowMs, bindings), nowMs };
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

