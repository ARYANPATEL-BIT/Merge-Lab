# Handshake

A pre-push interface contract registry. A CLI/daemon reads each dev's working
tree (including uncommitted changes) and publishes DECLARATIONS ONLY —
exported signatures, data shapes, deps, env var names, routes. Never source
code. Teammates' agents read those contracts at SessionStart and are blocked
at PreToolUse when a write drifts from them.

## Hard rules
- Never transmit file contents, diffs, or literal values. Names and types only.
- Enforcement is deterministic. Never block on an LLM opinion.
- Every hook fails open: on any error, print nothing, exit 0.
- Extraction failure returns [] and increments a counter. Never guess.
- Never leave a TODO in a deliverable. If a design choice is unclear, ask
  before writing, not after.
- Import from @handshake/shared and services/resolver. Never reimplement
  validation, rules, or versioning.

## Stack
Node 20, TypeScript, ESM, ts-morph, vitest, pnpm workspaces.
AWS: Lambda + API Gateway + DynamoDB, SAM. Region ap-south-1.

## State
Done: packages/shared, packages/extractor, services/resolver, infra + handlers,
packages/daemon (CLI publisher), packages/hooks (Claude Code SessionStart +
PreToolUse, via the handshake bin), services/board (GET /v1/board), board
(React + Vite projector UI; demo mode reuses resolver's assembleBoard).

- Tests must never touch ~/.handshake. Config path comes from a
  HANDSHAKE_CONFIG_DIR override; tests set it to a temp dir.