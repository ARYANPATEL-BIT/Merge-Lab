# Merge Lab

The pre-push context layer. A local daemon watches each dev's
working tree (including uncommitted changes) and publishes **declarations only**
— exported signatures, data shapes, deps, env var names, routes. Never source
code. Teammates' agents read those contracts at SessionStart and are blocked at
PreToolUse when a write drifts from them.

## Hard rules

- Never transmit file contents, diffs, or literal values. Names and types only.
- Enforcement is deterministic. Never block on an LLM opinion.
- Every hook fails open: on any error, print nothing, exit 0.
- Extraction failure returns `[]` and increments a counter. Never guess.

## Layout

| Path                  | Tier | Role                                                            |
| --------------------- | ---- | -------------------------------------------------------------- |
| `packages/shared`     | P1   | Canonical DECLARATION contract types. Everyone imports here.    |
| `packages/extractor`  | P1   | ts-morph walk of a working tree → `Declaration[]`.              |
| `services/resolver`   | P1   | Resolves the authoritative contract set read at SessionStart.  |
| `fixtures`            | P1   | Source trees + expected declarations for extractor tests.      |
| `infra`               | P2   | SAM: Lambda + API Gateway + DynamoDB (ap-south-1).             |
| `services/ingest`     | P2   | Accepts published declarations from daemons.                   |
| `services/context`    | P2   | Serves teammate contracts at SessionStart.                     |
| `services/verdict`    | P2   | Deterministic drift check consumed at PreToolUse.              |
| `packages/daemon`     | P3   | Watches the working tree and publishes declarations.           |
| `packages/hooks`      | P3   | SessionStart + PreToolUse hooks. Fail open.                    |
| `board`               | P4   | Dashboard UI.                                                  |

## Stack

Node 20, TypeScript, ts-morph, vitest, pnpm workspaces.
AWS: Lambda + API Gateway + DynamoDB via SAM. Region `ap-south-1`.

## Getting started

```sh
pnpm install
pnpm typecheck
pnpm test
```
