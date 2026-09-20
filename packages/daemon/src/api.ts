// HTTP client for the Merge Lab API. Every response is validated against the
// shared schemas so the daemon never acts on a payload the registry did not
// promise. All failures - transport, non-2xx, malformed body - surface as
// ApiError, which the commands catch to fail open (warn + exit 0).

import {
  GetContextResponseSchema,
  PostDeclarationsResponseSchema,
  PostVerdictResponseSchema,
  type GetContextResponse,
  type PostDeclarationsRequest,
  type PostDeclarationsResponse,
  type PostVerdictRequest,
  type Verdict,
} from "@mergelab/shared";
import type { Config } from "./config.js";

export class ApiError extends Error {}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

/** Optional per-request controls. `signal` lets a caller enforce a timeout. */
export interface RequestOptions {
  signal?: AbortSignal;
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new ApiError(`network error: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new ApiError("response body was not JSON");
  }
}

function jsonHeaders(cfg: Config): Record<string, string> {
  return { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" };
}

export async function postDeclarations(
  cfg: Config,
  req: PostDeclarationsRequest,
): Promise<PostDeclarationsResponse> {
  const json = await requestJson(joinUrl(cfg.apiUrl, "/v1/declarations"), {
    method: "POST",
    headers: jsonHeaders(cfg),
    body: JSON.stringify(req),
  });
  const parsed = PostDeclarationsResponseSchema.safeParse(json);
  if (!parsed.success) throw new ApiError("unexpected /v1/declarations response");
  return parsed.data;
}

export async function getContext(
  cfg: Config,
  query: { repo: string; branch?: string; exclude_owner?: string },
  opts: RequestOptions = {},
): Promise<GetContextResponse> {
  const params = new URLSearchParams({ repo: query.repo });
  if (query.branch) params.set("branch", query.branch);
  if (query.exclude_owner) params.set("exclude_owner", query.exclude_owner);
  const json = await requestJson(
    `${joinUrl(cfg.apiUrl, "/v1/context")}?${params.toString()}`,
    { method: "GET", headers: { authorization: `Bearer ${cfg.token}` }, signal: opts.signal },
  );
  const parsed = GetContextResponseSchema.safeParse(json);
  if (!parsed.success) throw new ApiError("unexpected /v1/context response");
  return parsed.data;
}

export async function postVerdict(
  cfg: Config,
  req: PostVerdictRequest,
  opts: RequestOptions = {},
): Promise<Verdict> {
  const json = await requestJson(joinUrl(cfg.apiUrl, "/v1/verdict"), {
    method: "POST",
    headers: jsonHeaders(cfg),
    body: JSON.stringify(req),
    signal: opts.signal,
  });
  const parsed = PostVerdictResponseSchema.safeParse(json);
  if (!parsed.success) throw new ApiError("unexpected /v1/verdict response");
  return parsed.data;
}
