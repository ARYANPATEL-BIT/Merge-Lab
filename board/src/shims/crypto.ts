// Browser stub for node:crypto used by @mergelab/shared in the board bundle.
//
// - createHash is only reached by shapeHash / hashToken, which the board never
//   calls at runtime, so it throws to make any accidental use loud.
// - randomBytes IS reached (generateWorkspaceToken / generateJoinCode power the
//   demo-mode workspace flows), so it is a real implementation over Web Crypto.

export function createHash(): never {
  throw new Error("node:crypto createHash is not available in the board (browser) build");
}

/**
 * Web Crypto-backed randomBytes. Returns a Uint8Array (indexable, as the shared
 * join-code generator expects) whose toString("hex") matches Node's Buffer, as
 * the token generator expects.
 */
export function randomBytes(size: number): Uint8Array {
  const arr = new Uint8Array(size);
  crypto.getRandomValues(arr);
  Object.defineProperty(arr, "toString", {
    value: (encoding?: string) =>
      encoding === "hex"
        ? Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("")
        : Array.prototype.toString.call(arr),
    enumerable: false,
  });
  return arr;
}
