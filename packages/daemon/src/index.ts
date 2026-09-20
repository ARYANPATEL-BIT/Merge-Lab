// @mergelab/daemon - the CLI publisher and the reusable library the hooks
// build on. Reads a developer's working tree and publishes DECLARATIONS ONLY to
// the registry; reads back the contracts this branch can consume; runs a
// one-file drift check; and dispatches the Claude Code hooks. Not a filesystem
// watcher - a command you run.
//
//   mergelab init --api-url <url> --token <token> [--owner <name>] [--mode m]
//   mergelab publish              publish the working tree's declarations
//   mergelab context              print the contracts this branch can consume
//   mergelab check <file>         drift-check one file against active contracts
//   mergelab hook session-start   SessionStart hook (reads stdin)
//   mergelab hook pre-write       PreToolUse hook (reads stdin)

import { runHook } from "@mergelab/hooks";
import { cmdCheck } from "./check.js";
import { cmdContext } from "./context.js";
import { cmdInit } from "./init.js";
import { cmdPublish } from "./publish.js";
import { readStdin } from "./stdin.js";

// Public library surface - imported by @mergelab/hooks so the hooks reuse the
// exact config, identity, transport, extraction, and rendering the CLI uses.
export { loadConfig, type Config, type Mode } from "./config.js";
export { resolveIdentity, type Identity } from "./identity.js";
export { ApiError, getContext, postVerdict } from "./api.js";
export { extractFile } from "./extract.js";
export { renderContext } from "./render.js";
export { isSourceFile, repoRoot, toPosix } from "./git.js";

const USAGE = `mergelab - pre-push interface contract registry

Usage:
  mergelab init --api-url <url> --token <token> [--owner <name>] [--mode off|warn|block]
  mergelab publish
  mergelab context
  mergelab check <file>
  mergelab hook session-start
  mergelab hook pre-write`;

/** Dispatch one CLI invocation. Rejects on local errors; network fails open. */
export async function runCli(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  switch (command) {
    case "init":
      return cmdInit(rest);
    case "publish":
      return cmdPublish();
    case "context":
      return cmdContext();
    case "check":
      return cmdCheck(rest[0]);
    case "hook": {
      // Hooks own their exit code and fail open: even a bad subcommand exits 0.
      const outcome = await runHook(rest, await readStdin());
      if (outcome.stdout) process.stdout.write(outcome.stdout);
      process.exitCode = outcome.exitCode;
      return;
    }
    case undefined:
    case "-h":
    case "--help":
      process.stdout.write(`${USAGE}\n`);
      return;
    default:
      process.stderr.write(`mergelab: unknown command '${command}'\n${USAGE}\n`);
      process.exitCode = 1;
      return;
  }
}
