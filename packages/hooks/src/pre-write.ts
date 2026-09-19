// `handshake hook pre-write` — the PreToolUse hook. Extracts declarations from
// the PROPOSED file content (never the on-disk version), asks the registry for
// a deterministic verdict, and enforces it up to the configured mode.
//
// Enforcement is fail-open by construction: a non-source file, mode "off", an
// "allow" verdict, the 300ms budget being blown, or ANY error all allow the
// write silently. Only a "block" verdict under mode "block" denies; a "warn"
// (or a "block" softened by mode "warn") surfaces the reason as context.

import { isAbsolute, relative, resolve } from "node:path";
import type { Verdict } from "@handshake/shared";
import {
  extractFile,
  isSourceFile,
  loadConfig,
  postVerdict,
  resolveIdentity,
  toPosix,
} from "@handshake/daemon";
import { allowWithContext, deny, SILENT, type HookOutcome } from "./outcome.js";

/** Hard budget for the verdict round-trip. Past this we abort and allow. */
const TIMEOUT_MS = 300;

interface PreWritePayload {
  cwd?: string;
  tool_name?: string;
  tool_input?: { file_path?: unknown; content?: unknown };
}

/** The reason to show the agent: the deciding finding, names and types only. */
function reasonFor(verdict: Verdict, severity: "block" | "warn"): string {
  const finding = verdict.findings.find((f) => f.severity === severity) ?? verdict.findings[0];
  return finding?.reason ?? "write drifts from an active contract";
}

export async function preWrite(stdin: string): Promise<HookOutcome> {
  try {
    const payload = JSON.parse(stdin) as PreWritePayload;
    const input = payload.tool_input ?? {};
    const filePath = input.file_path;
    const content = input.content;

    // Nothing extractable, or not a source file: allow immediately.
    if (typeof filePath !== "string" || typeof content !== "string") return SILENT;
    if (!isSourceFile(filePath)) return SILENT;

    const cfg = await loadConfig();
    if (cfg.mode === "off") return SILENT;

    const cwd = typeof payload.cwd === "string" ? payload.cwd : process.cwd();
    const { repo, branch, owner, root } = resolveIdentity(cwd, cfg.owner);
    const abs = isAbsolute(filePath) ? filePath : resolve(root, filePath);
    const rel = toPosix(relative(root, abs));
    const declarations = extractFile(root, rel, content);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let verdict: Verdict;
    try {
      verdict = await postVerdict(
        cfg,
        { repo, branch, owner, declarations },
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timer);
    }

    if (verdict.verdict === "allow") return SILENT;
    if (verdict.verdict === "block" && cfg.mode === "block") {
      return deny(reasonFor(verdict, "block"));
    }
    // A "warn" verdict, or a "block" softened to a warning by mode "warn".
    const severity = verdict.verdict === "block" ? "block" : "warn";
    return allowWithContext(reasonFor(verdict, severity));
  } catch {
    return SILENT;
  }
}
