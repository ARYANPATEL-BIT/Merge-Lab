// `mergelab publish` - read the working tree, extract declarations from every
// changed source file plus package.json dep changes, and POST the batch. Prints
// what it published. Names and types only; source code never leaves the tree.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PostDeclarationsRequestSchema,
  SCHEMA_VERSION,
  type Declaration,
} from "@mergelab/shared";
import { ApiError, postDeclarations } from "./api.js";
import { loadConfig } from "./config.js";
import { changedSourceFiles } from "./git.js";
import { extractFile, packageManifestDeps } from "./extract.js";
import { resolveIdentity } from "./identity.js";
import { info, warn } from "./log.js";

/** The repo-relative file portion of a source_ref ("a.ts:14" -> "a.ts"). */
function fileOf(sourceRef: string): string {
  const colon = sourceRef.lastIndexOf(":");
  if (colon > 0 && /^\d+$/.test(sourceRef.slice(colon + 1))) {
    return sourceRef.slice(0, colon);
  }
  return sourceRef;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export async function cmdPublish(): Promise<void> {
  const cfg = await loadConfig();
  const { repo, branch, owner, root } = resolveIdentity(process.cwd(), cfg.owner);

  const declarations: Declaration[] = [];
  for (const relPath of changedSourceFiles(root)) {
    let content: string;
    try {
      content = readFileSync(join(root, relPath), "utf8");
    } catch {
      continue; // deleted between listing and read, or unreadable
    }
    declarations.push(...extractFile(root, relPath, content));
  }

  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    declarations.push(...packageManifestDeps(root, readFileSync(pkgPath, "utf8")));
  }

  if (declarations.length === 0) {
    info("Nothing to publish - no changed declarations in the working tree.");
    return;
  }

  const req = PostDeclarationsRequestSchema.parse({
    schema_version: SCHEMA_VERSION,
    repo,
    branch,
    owner,
    origin: "working_tree",
    declarations,
  });

  let response;
  try {
    response = await postDeclarations(cfg, req);
  } catch (e) {
    if (e instanceof ApiError) {
      warn(`publish failed, nothing published (${e.message})`);
      return;
    }
    throw e;
  }

  const fileCount = new Set(declarations.map((d) => fileOf(d.source_ref))).size;
  info(`Published ${plural(declarations.length, "declaration")} from ${plural(fileCount, "file")}.`);
  for (const d of declarations) info(`  ${d.kind} ${d.symbol}`);
  info(`Registry recorded ${plural(response.contracts.length, "contract")}.`);
}
