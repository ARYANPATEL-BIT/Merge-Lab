// Manifest extractor - diffs two package.json texts and emits dependency
// Declarations for added or changed deps, formatted "name@version".

import type { Declaration } from "@mergelab/shared";
import { bumpExtractFailed } from "./counter.js";
import { redact } from "./redactor.js";

const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

function collectDeps(pkg: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (pkg && typeof pkg === "object") {
    for (const field of DEP_FIELDS) {
      const section = (pkg as Record<string, unknown>)[field];
      if (section && typeof section === "object") {
        for (const [name, version] of Object.entries(section as Record<string, unknown>)) {
          if (typeof version === "string") out[name] = version;
        }
      }
    }
  }
  return out;
}

export function extractManifestDeps(
  oldText: string,
  newText: string,
  path = "package.json",
): Declaration[] {
  let oldDeps: Record<string, string>;
  let newDeps: Record<string, string>;
  try {
    oldDeps = collectDeps(JSON.parse(oldText));
    newDeps = collectDeps(JSON.parse(newText));
  } catch {
    bumpExtractFailed();
    return [];
  }

  const decls: Declaration[] = [];
  for (const [name, version] of Object.entries(newDeps)) {
    if (oldDeps[name] === version) continue; // unchanged
    decls.push({
      kind: "dependency",
      symbol: name,
      provides: [],
      consumes: [],
      deps: [`${name}@${version}`],
      source_ref: path,
      origin: "working_tree",
      confidence: 1,
    });
  }
  return decls
    .map(redact)
    .filter((d): d is Declaration => d !== null);
}
