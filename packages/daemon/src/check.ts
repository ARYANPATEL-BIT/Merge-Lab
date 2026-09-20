// `mergelab check <file>` - extract one file, ask the registry for a verdict
// against active teammate contracts, and print the findings. Read-only: this is
// the same deterministic drift check the PreToolUse hook will run.

import { readFileSync } from "node:fs";
import { relative, resolve as resolvePath } from "node:path";
import { PostVerdictRequestSchema } from "@mergelab/shared";
import { ApiError, postVerdict } from "./api.js";
import { loadConfig } from "./config.js";
import { toPosix } from "./git.js";
import { extractFile } from "./extract.js";
import { resolveIdentity } from "./identity.js";
import { info, warn } from "./log.js";

export async function cmdCheck(target: string | undefined): Promise<void> {
  if (!target) throw new Error("usage: mergelab check <file>");
  const cfg = await loadConfig();
  const { repo, branch, owner, root } = resolveIdentity(process.cwd(), cfg.owner);

  const absPath = resolvePath(process.cwd(), target);
  const relPath = toPosix(relative(root, absPath));
  let content: string;
  try {
    content = readFileSync(absPath, "utf8");
  } catch {
    throw new Error(`cannot read ${target}`);
  }

  const declarations = extractFile(root, relPath, content);
  const req = PostVerdictRequestSchema.parse({ repo, branch, owner, declarations });

  let verdict;
  try {
    verdict = await postVerdict(cfg, req);
  } catch (e) {
    if (e instanceof ApiError) {
      warn(`check unavailable (${e.message})`);
      return;
    }
    throw e;
  }

  info(`Verdict: ${verdict.verdict}.`);
  if (verdict.findings.length === 0) {
    info("No drift against active contracts.");
    return;
  }
  for (const f of verdict.findings) {
    const ids = f.contract_ids.length > 0 ? ` (${f.contract_ids.join(", ")})` : "";
    info(`  [${f.severity}] ${f.rule}: ${f.reason}${ids}`);
  }
}
