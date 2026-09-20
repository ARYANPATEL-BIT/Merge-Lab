# Merge Lab

The pre-push interface contract registry for developers and AI agents.

<<<<<<< Updated upstream
An interface decision—the shape of a data model, the casing of a field, or the choice of an HTTP client—is made in the first five minutes of a session, but its implementation takes the next several hours. Merge Lab linters your teammates' unpushed decisions across parallel git branches by publishing **declarations only** (exported signatures, types, routes, dependencies, and env names—never source code or literal values), enabling AI agents to coordinate at `SessionStart` and intercept breaking drift at `PreToolUse`.
=======
An interface decision - the shape of a User, the name of a route, the choice of HTTP client - is made in the first five minutes of a session, but its implementation takes the next three hours. Merge Lab is a linter for your teammates' unpushed decisions that moves these choices onto the wire the moment they exist, not the moment they ship. A local CLI reads each dev's working tree (including uncommitted changes) on demand - it is a command you run, not a filesystem watcher - and publishes **declarations only** - exported signatures, data shapes, deps, env var names, routes. Never source code. Teammates' agents read those contracts at SessionStart and are blocked at PreToolUse when a write drifts from them.

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
| `infra`               | P2   | SAM: Lambda + API Gateway + DynamoDB + Bedrock (ap-south-1).   |
| `services/ingest`     | P2   | Accepts published declarations from the CLI.                   |
| `services/context`    | P2   | Serves teammate contracts at SessionStart.                     |
| `services/verdict`    | P2   | Deterministic drift check consumed at PreToolUse.              |
| `services/board`      | P2   | Serves the projector board snapshot (GET /v1/board).          |
| `services/auth`       | P2   | Email/password signup + login and workspace management.       |
| `services/semantic`   | P2   | Async advisory semantic-duplicate check via Bedrock.          |
| `packages/daemon`     | P3   | The CLI that walks the working tree. A deliberate choice over a background daemon for better visibility and control. |
| `packages/hooks`      | P3   | SessionStart + PreToolUse hooks. Fail open.                    |
| `board`               | P4   | Dashboard UI.                                                  |

## Stack

Node 20, TypeScript, ts-morph, vitest, pnpm workspaces.
AWS: Lambda + API Gateway + DynamoDB + Bedrock via SAM. Region `ap-south-1`.
>>>>>>> Stashed changes

## Architecture

Merge Lab is serverless, running in AWS region `ap-south-1`.

```mermaid
flowchart TD
    subgraph Devs [Developer Machines & AI Agents]
        DevA[Dev A: Claude Code / Cursor]
        DevB[Dev B: Claude Code / Cursor]
        CLI[mergelab CLI / Daemon]
    end

<<<<<<< Updated upstream
    subgraph AWS [AWS Serverless Control Plane ap-south-1]
        API(Amazon API Gateway HTTP API)
        
        Ingest[Ingest Lambda]
        Context[Context Lambda]
        Verdict[Verdict Lambda]
        BoardFn[Board Lambda]
        AuthFn[Auth Lambda]
        SemanticFn[Semantic Lambda]
        
        DDB[(Amazon DynamoDB MergelabTable)]
        Bedrock[Amazon Bedrock Claude 3 Haiku]
    end

    subgraph UI [Projector Dashboard]
        Board[React + Vite Projector UI]
=======
    subgraph AWS [AWS Control Plane ap-south-1]
        API(API Gateway)
        API --> Ingest[ingest Lambda]
        API --> Context[context Lambda]
        API --> Verdict[verdict Lambda]
        API --> BoardFn[board Lambda]
        API --> Auth[auth Lambda]
        API --> Semantic[semantic Lambda]
        Ingest -. async .-> Semantic
        Ingest --> DB[(DynamoDB)]
        Context --> DB
        Verdict --> DB
        BoardFn --> DB
        Auth --> DB
        Semantic --> DB
        Semantic --> Bedrock[Amazon Bedrock<br/>Claude 3 Haiku]
    end

    subgraph UI [Projector]
        BoardUI[Board UI] -->|polls| API
>>>>>>> Stashed changes
    end

    DevA -->|PostToolUse: mergelab publish| API
    DevB -->|SessionStart: mergelab hook session-start| API
    DevB -->|PreToolUse: mergelab hook pre-write| API
    
    API --> Ingest
    API --> Context
    API --> Verdict
    API --> BoardFn
    API --> AuthFn
    API --> SemanticFn

    Ingest -->|Write contracts| DDB
    Ingest -.->|Async invoke| SemanticFn
    SemanticFn -->|InvokeModel| Bedrock
    SemanticFn -->|Advisory findings| DDB
    Context -->|Query active contracts| DDB
    Verdict -->|Sub-10ms point reads| DDB
    BoardFn -->|Query board state| DDB
    AuthFn -->|Tokens & Workspaces| DDB

    Board -->|Polls /v1/board| API
```

## Hard Rules

- **Never transmit source code**: Only exported symbols, signatures, shapes, dependencies, env var names, and routes. Never file contents, diffs, or literal values.
- **Deterministic enforcement**: Writes are blocked **only** by the 6 deterministic resolver rules, never on an LLM opinion. The 300ms budget is non-negotiable.
- **Fail-open by design**: On any error, network timeout, missing config, or blown budget, hooks print nothing and exit `0`.
- **Factual context**: Injected agent context contains only factual declarations about active contracts and repo conventions, never imperative instructions.
- **Asynchronous advisory AI**: Amazon Bedrock runs purely asynchronously off the ingest path to flag fuzzy duplicate symbols (`SEMANTIC_DUPLICATE`); it is never in the blocking verdict path and its severity is strictly `warn`.

## Quickstart

### 1. Requirements
- Node.js 20+
- pnpm 9+

### 2. One-Command Setup
Install dependencies, run typechecks across all 12 workspace packages, and execute the test suite:
```bash
pnpm install && pnpm typecheck && pnpm test
```

### 3. Run the Board Locally
Start the React projector dashboard in demo mode:
```bash
pnpm --filter @mergelab/board dev
```
Open `http://localhost:5173/` in your browser.

### 4. Run the Deterministic Scenarios Table
Merge Lab verifies its 6 deterministic rules (`DEP_CONFLICT`, `NAMING_DRIFT`, `DUP_SYMBOL`, `ROUTE_COLLISION`, `SHAPE_MISMATCH`, `STALE_BINDING`) using an isolated scenarios runner:
```bash
pnpm --filter @mergelab/resolver run test:scenarios
```

## Connecting an IDE

Developers configure the `mergelab` binary in their IDE hooks. First initialize your local configuration:
```bash
mergelab init --api-url https://<api-id>.execute-api.ap-south-1.amazonaws.com --token <workspace-token> --mode block
```
*(Modes: `block` to deny drifting writes, `warn` to allow with context, or `off` to disable).*

### Claude Code Configuration
Add Merge Lab hooks to your project's `.claude/settings.json`:
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
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          { "type": "command", "command": "mergelab hook pre-write" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          { "type": "command", "command": "mergelab publish" }
        ]
      }
    ]
  }
}
```

### Cursor Configuration
Add Merge Lab hooks to your project's `.cursor/hooks.json`:
```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [{ "command": "mergelab hook session-start" }],
    "preToolUse": [{ "command": "mergelab hook pre-write" }],
    "afterFileEdit": [{ "command": "mergelab publish" }]
  }
}
```

## Running Tests

Run all 137 unit and integration tests across all 21 test suites:
```bash
pnpm test
```
Or run Vitest directly with threaded pool execution:
```bash
npx vitest run --pool=threads
```

## Known Seams (What Is Not Built)

To maintain absolute transparency, the following capabilities are deliberately not built or remain manual in the current repository:

- **Cognito & IAM Federation**: Authentication uses hashed workspace tokens (`ml_ws_...`) and the legacy static bearer token (`MERGELAB_TOKEN`). There is no AWS Cognito User Pool or IAM federated identity provider.
- **EventBridge & Real-time WebSockets**: There is no Amazon EventBridge event bus or WebSocket API Gateway. The Board UI polls `/v1/board` (every 3 seconds), and hooks query HTTP endpoints on demand.
- **GSI2 (Reverse Symbol Index)**: DynamoDB provisions `GSI1` (branch-level partition queries). A second index (`GSI2`) for reverse lookups (symbol → all consumer branches) is not modeled.
- **Persisted Coupling Graph**: `runRules` compares incoming declarations against active contracts loaded for the repo. There is no durable graph database or persisted dependency edge store.
- **BIND Row Ingestion**: The `verdict` handler contains logic to evaluate `STALE_BINDING` by reading `BIND#<branch>#<contract_id>` items, but no public API endpoint currently writes `BIND` records. In practice, `STALE_BINDING` stays silent unless rows are manually seeded.
- **Automated Branch Lifecycle**: Only `declared` and `changed` contract statuses are produced by the ingest handler. Lifecycle transitions (`implementing`, `implemented`, `abandoned`) are not automatically synchronized with git remote deletions.
- **Shared HTTP Library**: Authentication, logging, and DynamoDB marshalling helpers are kept local to each Lambda package to preserve team ownership boundaries, rather than extracted into a common shared package.
