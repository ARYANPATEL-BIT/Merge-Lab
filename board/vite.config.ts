import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

// The board imports @mergelab/resolver + @mergelab/shared as TypeScript source
// (not built packages), so alias them to their entry files and let Vite compile
// them. `node:crypto` is only reachable via shared.shapeHash - never called on
// the board - so it is stubbed to keep the browser bundle clean.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@mergelab/shared": resolve(repoRoot, "packages/shared/src/index.ts"),
      "@mergelab/resolver": resolve(repoRoot, "services/resolver/src/index.ts"),
      "node:crypto": resolve(here, "src/shims/crypto.ts"),
    },
  },
  // Allow serving the workspace's shared source and the fixtures directory,
  // which live above the board package root.
  server: { fs: { allow: [repoRoot] } },
  // three.js is deliberately code-split into its own chunk (loaded only for the
  // desktop hero visual), so ~520 kB there is expected, not a regression.
  build: { chunkSizeWarningLimit: 600 },
});
