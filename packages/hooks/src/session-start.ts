// `handshake hook session-start` — the SessionStart hook. Resolves the repo and
// branch from the payload's cwd, fetches the contracts this branch can consume
// (excluding my own), and prints the rendered block for Claude Code to inject.
// On ANY error, or when there is nothing to say, it prints nothing and exits 0.

import { getContext, loadConfig, renderContext, resolveIdentity } from "@handshake/daemon";
import { context, SILENT, type HookOutcome } from "./outcome.js";

interface SessionStartPayload {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
}

export async function sessionStart(stdin: string): Promise<HookOutcome> {
  try {
    const payload = JSON.parse(stdin) as SessionStartPayload;
    if (typeof payload.cwd !== "string") return SILENT;

    const cfg = await loadConfig();
    const { repo, branch, owner } = resolveIdentity(payload.cwd, cfg.owner);
    const { contracts } = await getContext(cfg, { repo, branch, exclude_owner: owner });

    // Absence of data must read as absence — say nothing rather than a header
    // with an empty body that reads as "nobody is working on this."
    if (contracts.length === 0) return SILENT;

    return context(renderContext({ repo, branch, contracts, now: new Date() }));
  } catch {
    return SILENT;
  }
}
