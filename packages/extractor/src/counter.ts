// Failure counter for extraction. Hard rule: never throw. On any parse error
// the extractor bumps this and returns []. Exported as an ESM live binding so
// importers (and re-exports) observe increments.

export let extractFailed = 0;

export function bumpExtractFailed(): void {
  extractFailed += 1;
}

/** Test hook — reset the counter between cases. */
export function resetExtractFailed(): void {
  extractFailed = 0;
}
