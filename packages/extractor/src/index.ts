// @handshake/extractor — turns a working tree's source + manifests into
// Declarations. P1-owned. Imports the frozen contract types from
// @handshake/shared; never redefines them.
//
// Hard rules:
//  - Emit names and types only (enforced by the redactor before return).
//  - Any parse error returns [] and bumps `extractFailed`. Never throws.

import type { Declaration } from "@handshake/shared";

/** A source-file extractor for one family of file extensions. */
export interface Extractor {
  extensions: string[];
  extract(path: string, content: string): Declaration[];
}

export { typescriptExtractor } from "./typescript.js";
export { extractManifestDeps } from "./manifest.js";
export { redact } from "./redactor.js";
export { extractFailed, resetExtractFailed } from "./counter.js";
