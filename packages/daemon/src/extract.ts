// Turns on-disk files into Declarations by delegating to @mergelab/extractor.
// The daemon never parses source itself - it only decides which extractor a
// path belongs to and diffs package.json against HEAD for dependency changes.

import { basename } from "node:path";
import type { Declaration } from "@mergelab/shared";
import { extractManifestDeps, typescriptExtractor } from "@mergelab/extractor";
import { headFileText } from "./git.js";

/**
 * Declarations for one file, keyed off its name: package.json is diffed against
 * HEAD (added/changed deps only); everything else goes through the TS extractor.
 * `relPath` is repo-relative and becomes each declaration's source_ref.
 */
export function extractFile(
  root: string,
  relPath: string,
  content: string,
): Declaration[] {
  if (basename(relPath) === "package.json") {
    const oldText = headFileText(root, relPath) ?? "{}";
    return extractManifestDeps(oldText, content, relPath);
  }
  return typescriptExtractor.extract(relPath, content);
}

/** Dependency declarations from the root package.json vs its HEAD revision. */
export function packageManifestDeps(root: string, content: string): Declaration[] {
  const oldText = headFileText(root, "package.json") ?? "{}";
  return extractManifestDeps(oldText, content, "package.json");
}
