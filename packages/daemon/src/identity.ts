// Resolves the three coordinates every declaration is filed under: which repo,
// which branch, and who is publishing. Repo prefers the origin remote so every
// teammate agrees on one identifier; with no remote we fall back to a stable
// hash of the absolute path so a local-only clone still has a name.

import { createHash } from "node:crypto";
import { repoRoot, tryGit } from "./git.js";

export interface Identity {
  repo: string;
  branch: string;
  owner: string;
  root: string;
}

/** Trim `.git`/trailing slash so ssh and https of one remote read the same-ish. */
function normalizeRemote(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\.git$/, "");
}

function resolveRepo(root: string): string {
  const origin = tryGit(["remote", "get-url", "origin"], root);
  if (origin) return normalizeRemote(origin);
  const hash = createHash("sha256").update(root).digest("hex").slice(0, 12);
  return `path:${hash}`;
}

/**
 * Resolve identity for the repo containing `cwd`. `ownerOverride` (from config)
 * wins over `git config user.name`; both may be absent, leaving owner "unknown".
 */
export function resolveIdentity(cwd: string, ownerOverride?: string): Identity {
  const root = repoRoot(cwd);
  const branch = tryGit(["rev-parse", "--abbrev-ref", "HEAD"], root) || "HEAD";
  const owner = ownerOverride ?? tryGit(["config", "user.name"], root) ?? "unknown";
  return { repo: resolveRepo(root), branch, owner, root };
}
