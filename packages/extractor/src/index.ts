// @handshake/extractor — walks a working tree with ts-morph and returns
// Declarations. P1-owned.
//
// Hard rules:
//  - Emit names and types only. Never file contents, diffs, or literal values.
//  - Extraction failure returns [] and increments a counter. Never guess.

import type { Declaration } from "@handshake/shared";

/** Count of extraction failures since process start. Never guess on failure. */
let extractionFailures = 0;

export function extractionFailureCount(): number {
  return extractionFailures;
}

/**
 * Extract declarations from a working tree rooted at `projectRoot`.
 * On any failure, returns [] and increments the failure counter.
 */
export function extract(_projectRoot: string): Declaration[] {
  try {
    // TODO: ts-morph project load + declaration walk.
    return [];
  } catch {
    extractionFailures += 1;
    return [];
  }
}
