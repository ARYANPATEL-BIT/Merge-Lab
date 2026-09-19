#!/usr/bin/env node
// Bin entry. esbuild preserves this hashbang in the bundled dist/cli.cjs. Local
// errors print one line and exit 1; network errors already fail open inside the
// commands, so anything reaching here is a real misconfiguration.

import { runCli } from "./index.js";

runCli(process.argv.slice(2)).catch((e: unknown) => {
  process.stderr.write(`handshake: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
