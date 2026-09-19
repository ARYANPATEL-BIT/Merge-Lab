// The shape every hook entrypoint returns: what to write to stdout and which
// exit code to leave. Keeping entrypoints pure (payload string in, outcome out)
// is what lets the tests assert exit codes and stdout without touching process
// I/O — the daemon bin does the actual reading and writing.

/** Claude Code blocks a tool call on exit code 2 (see docs/hooks). */
export const BLOCK_EXIT_CODE = 2;

export interface HookOutcome {
  stdout: string;
  exitCode: number;
}

/** Fail-open / allow silently: print nothing, exit 0. The default everywhere. */
export const SILENT: HookOutcome = { stdout: "", exitCode: 0 };

/** PreToolUse deny: reason travels to the agent so it can self-correct. */
export function deny(reason: string): HookOutcome {
  const body = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
  return { stdout: JSON.stringify(body), exitCode: BLOCK_EXIT_CODE };
}

/** PreToolUse allow, surfacing a reason as additional context (non-blocking). */
export function allowWithContext(reason: string): HookOutcome {
  const body = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      additionalContext: reason,
    },
  };
  return { stdout: JSON.stringify(body), exitCode: 0 };
}

/** SessionStart injects plain-text stdout into the session context. */
export function context(block: string): HookOutcome {
  return { stdout: `${block}\n`, exitCode: 0 };
}
