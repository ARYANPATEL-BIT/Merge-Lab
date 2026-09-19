// Board data source. One shape — { board, nowMs } — feeds the UI whether it
// comes from the live registry or the bundled demo fixture. `nowMs` is the
// reference clock the UI measures "reported N ago" and active/dormant against,
// so timestamps and status dots always agree.

import { assembleBoard } from "@handshake/resolver";
import { GetBoardResponseSchema, type GetBoardResponse } from "@handshake/shared";
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

  const url = new URL("/v1/board", API_URL);
  url.searchParams.set("repo", REPO);
  const res = await fetch(url, {
    headers: API_TOKEN ? { authorization: `Bearer ${API_TOKEN}` } : {},
    signal,
  });
  if (!res.ok) throw new Error(`registry returned HTTP ${res.status}`);

  const parsed = GetBoardResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("registry returned an unexpected board shape");
  return { board: parsed.data, nowMs: Date.now() };
}
