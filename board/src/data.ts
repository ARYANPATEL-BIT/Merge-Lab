// Board data source. One shape — { board, nowMs } — feeds the UI whether it
// comes from the live registry or the bundled demo fixture. `nowMs` is the
// reference clock the UI measures "reported N ago" and active/dormant against,
// so timestamps and status dots always agree.

import { assembleBoard } from "@handshake/resolver";
import {
  GetBoardResponseSchema,
  type Contract,
  type GetBoardResponse,
} from "@handshake/shared";
import fixtureRaw from "../../fixtures/declarations.sample.json";

const API_URL = import.meta.env.VITE_API_URL;
const API_TOKEN = import.meta.env.VITE_API_TOKEN;
const REPO = import.meta.env.VITE_REPO ?? "acme/app";

/** No API URL configured → render from the bundled fixture. */
export const isDemo = !API_URL;
export const repo = REPO;

export interface BoardSnapshot {
  board: GetBoardResponse;
  nowMs: number;
}

// Anchor the demo clock just after the fixture's newest heartbeat: the most
// recent branch reads "active", older ones "dormant". Derived from the data,
// so it never decays to all-dormant while the board sits on a projector.
function demoNow(contracts: Contract[]): number {
  const latest = contracts.reduce((max, c) => {
    const t = Date.parse(c.declared_at);
    return Number.isNaN(t) ? max : Math.max(max, t);
  }, 0);
  return latest + 60_000;
}

export function loadDemo(): BoardSnapshot {
  const contracts = fixtureRaw as Contract[];
  const nowMs = demoNow(contracts);
  return { board: assembleBoard(contracts, nowMs), nowMs };
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
