// @handshake/hooks — Claude Code hook entrypoints, dispatched by the handshake
// bin as `handshake hook <sub>`. Codex and Antigravity adapters are deferred;
// the response shapes here are Claude Code's. Every entrypoint fails open: it
// takes the raw stdin payload and returns an outcome, never throwing.

import { preWrite } from "./pre-write.js";
import { sessionStart } from "./session-start.js";
import { SILENT, type HookOutcome } from "./outcome.js";

export { sessionStart } from "./session-start.js";
export { preWrite } from "./pre-write.js";
export { SILENT, type HookOutcome } from "./outcome.js";

/** Route `handshake hook <sub>`. An unknown subcommand fails open (exit 0). */
export async function runHook(argv: string[], stdin: string): Promise<HookOutcome> {
  switch (argv[0]) {
    case "session-start":
      return sessionStart(stdin);
    case "pre-write":
      return preWrite(stdin);
    default:
      return SILENT;
  }
}
