# @mergelab/hooks

Claude Code hooks for Merge Lab, dispatched by the `mergelab` bin so you
configure a single command. Two entrypoints:

- **`mergelab hook session-start`** (SessionStart) - resolves the repo/branch
  from the session's `cwd`, fetches the contracts this branch can consume
  (excluding your own), and prints the rendered block to stdout. Claude Code
  injects that stdout into the session context. Nothing to say, or any error →
  prints nothing, exits 0.

- **`mergelab hook pre-write`** (PreToolUse, `Write`) - extracts declarations
  from the **proposed** file content, asks `/v1/verdict` for a deterministic
  ruling, and enforces it up to your configured `mode`:
  - `block` verdict + `mode: "block"` → denies the write and hands the agent
    the finding's reason so it can self-correct.
  - `warn` verdict (or a `block` softened by `mode: "warn"`) → allows the write
    and surfaces the reason as additional context.
  - `allow`, `mode: "off"`, the 300 ms budget being exceeded, or any error →
    allows silently.

## Install

Add both hooks to your project's `.claude/settings.json` (assumes the
`mergelab` bin is on your `PATH` - see the daemon README for building/linking):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "mergelab hook session-start" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          { "type": "command", "command": "mergelab hook pre-write" }
        ]
      }
    ]
  }
}
```

`pre-write` reads the `Write` tool's `file_path` + `content`, so it checks
whole-file writes where the full proposed content is available. Non-source
files (anything but `.ts`/`.tsx`/`.js`/`.jsx`) are allowed without a round-trip.

If the bin is not linked, replace the command with the bundled file, e.g.
`node /abs/path/to/packages/daemon/dist/cli.cjs hook pre-write`.

## Configuration

Both hooks read `~/.mergelab/config.json` (override the directory with
`MERGELAB_CONFIG_DIR`). The `mode` field - `"off" | "warn" | "block"`,
default `"warn"` - governs `pre-write` enforcement. Set it with
`mergelab init --mode block`.

## Hooks must fail open

Every entrypoint is fail-open by construction: on any error - missing config,
no repo, a malformed payload, the API being unreachable, or the 300 ms verdict
budget being blown - it prints nothing and exits 0, never blocking your work.
A hard block happens only on an explicit `block` verdict under `mode: "block"`.
Enforcement is deterministic and never depends on an LLM opinion, and the deny
message carries names and types only - never source, diffs, or literals.
