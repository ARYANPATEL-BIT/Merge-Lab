// Browser stub for node:crypto. The board never calls shapeHash (the only
// consumer of createHash in @mergelab/shared), so this exists solely to keep
// the import resolvable in a browser bundle.
export function createHash(): never {
  throw new Error("node:crypto is not available in the board (browser) build");
}
