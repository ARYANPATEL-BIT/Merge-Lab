// @handshake/daemon — the CLI publisher. Reads a developer's working tree and
// publishes DECLARATIONS ONLY to the registry; reads back the contracts this
// branch can consume; and runs a one-file drift check. Not a filesystem
// watcher — a command you run.
//
//   handshake init --api-url <url> --token <token> [--owner <name>]
//   handshake publish        publish the working tree's declarations
//   handshake context        print the contracts this branch can consume
//   handshake check <file>   drift-check one file against active contracts

import { cmdCheck } from "./check.js";
import { cmdContext } from "./context.js";
import { cmdInit } from "./init.js";
import { cmdPublish } from "./publish.js";

const USAGE = `handshake — pre-push interface contract registry

Usage:
  handshake init --api-url <url> --token <token> [--owner <name>]
  handshake publish
  handshake context
  handshake check <file>`;

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
    case undefined:
    case "-h":
    case "--help":
      process.stdout.write(`${USAGE}\n`);
      return;
    default:
      process.stderr.write(`handshake: unknown command '${command}'\n${USAGE}\n`);
      process.exitCode = 1;
      return;
  }
}
