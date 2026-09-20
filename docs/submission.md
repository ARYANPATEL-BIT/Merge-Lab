# Project Submission: Merge Lab

*Ready-to-paste draft responses for the AWS Builder Center / Hackathon submission form.*

---

## 1. What does your project do?

### The Problem
In modern software teams where human developers and autonomous AI agents (such as Claude Code, Cursor, and Codex) work in parallel across separate git branches, interface decisions are made in the first five minutes of work. A developer or agent chooses a data model (e.g., `user_id` vs. `userId`), selects an external dependency (e.g., `axios` vs. `node-fetch`), or defines an API route. 

However, pull requests, CI checks, and merge conflict resolution do not occur until hours or days later when code is pushed. During this unpushed window, parallel branches drift silently. When branches finally integrate, teams face painful merge conflicts, broken runtime assumptions, duplicate helper functions, and incompatible dependencies.

### Who It Is For
Merge Lab is designed for engineering teams that use autonomous coding agents and human pair programmers on multi-branch TypeScript and JavaScript codebases. 

It acts as a pre-push interface contract registry and linter for teammates' unpushed decisions. A lightweight local CLI extracts **declarations only** (exported function signatures, TypeScript types/interfaces, package dependencies, environment variable names, and HTTP routes) - **never source code, implementation logic, diffs, or literal values**. Teammates' agents read those active contracts at `SessionStart` and are blocked deterministically at `PreToolUse` the instant a proposed write drifts from an established decision.

---

## 2. How did you use AWS?

Merge Lab's control plane is built serverless in the `ap-south-1` region using the following AWS services specified in `infra/template.yaml`:

1. **AWS Lambda**:
   - Six specialized Lambda functions running Node.js 20 on `arm64` (Graviton):
     - `IngestFunction`: Receives AST declaration payloads from developer machines, resolves versioning, and persists contracts.
     - `ContextFunction`: Serves active consumable contracts for a branch at `SessionStart`.
     - `VerdictFunction`: Evaluates proposed writes deterministically against active teammate contracts at `PreToolUse`.
     - `BoardFunction`: Powers the real-time project dashboard projector.
     - `AuthFunction`: Manages workspace tokens, join requests, and credential hashing.
     - `SemanticFunction`: Asynchronous worker running advisory duplicate detection.
2. **Amazon API Gateway**:
   - Single `AWS::Serverless::HttpApi` (HTTP API v2) providing unified routing, CORS configuration for the web dashboard origin, and low-latency proxying to Lambda.
3. **Amazon DynamoDB**:
   - A single-table design (`MergelabTable`) with `PAY_PER_REQUEST` billing. Uses composite primary keys (`PK`, `SK`) and one Global Secondary Index (`GSI1PK`, `GSI1SK`) to store contracts, workspace memberships, hashed bearer tokens, and semantic findings.
4. **Amazon Bedrock**:
   - Invoked asynchronously (`bedrock:InvokeModel`) using Claude 3 Haiku (`anthropic.claude-3-haiku-20240307-v1:0` in `ap-south-1`) to perform advisory semantic duplicate detection on exported function and type declarations.
5. **AWS SAM (Serverless Application Model)**:
   - Infrastructure-as-code template (`AWS::Serverless-2016-10-31`) managing packaging, IAM execution policies (`DynamoDBCrudPolicy`, `DynamoDBReadPolicy`, Bedrock invoke statements), and environment variable bindings.

### Architectural Rationale for Key Service Choices

- **Amazon DynamoDB Single-Table Design for the Verdict Path**:
  The IDE `PreToolUse` hook has a strict, non-negotiable budget of 300 milliseconds before it aborts and fails open. DynamoDB was chosen because composite key queries (`PK = :pk AND begins_with(SK, :sk)`) execute in sub-10 milliseconds without connection pooling or database cold starts.
- **AWS Lambda on Graviton arm64 via esbuild**:
  Developer hook executions are extremely bursty. Running Node.js 20 on `arm64` with esbuild-bundled handlers delivers near-instant cold starts (<150ms) and ~20% lower execution costs compared to x86_64.
- **Amazon Bedrock Decoupled Asynchronously**:
  Model inference introduces non-deterministic latency and potential hallucinations. By isolating Bedrock into an asynchronous Lambda triggered after ingest, we leverage Claude 3 Haiku for fuzzy similarity detection (e.g., detecting that `getUser` and `fetchUserById` do the same thing) while keeping the developer-blocking verdict path 100% deterministic and lightning-fast.

---

## 3. What did you NOT like about the AWS services used?

*(Real friction encountered during this build, naming services specifically)*:

- **AWS SAM & esbuild in Monorepos**:
  SAM's built-in esbuild packager struggles with modern pnpm monorepos containing workspace symlinks (such as `@mergelab/shared` and `@mergelab/resolver`). Relative `CodeUri` paths and bundling dependencies outside the function directory required delicate build properties and explicit external configurations.
- **Amazon API Gateway (HTTP API v2) Authentication Ergonomics**:
  While HTTP APIs are fast and cost-effective, they lack lightweight built-in header validation without provisioning a separate Lambda authorizer. We had to implement bearer token parsing and DynamoDB lookups repeatedly inside each Lambda handler.
- **Amazon DynamoDB Single-Table Relational Deletions**:
  Managing relational lifecycles (such as cascading contract deletions when a branch is abandoned or tracking reverse symbol bindings) is cumbersome in DynamoDB. The lack of declarative cascading deletes meant handling cleanup loops manually in application code.
- **Amazon Bedrock Regional Availability & Rate Limits**:
  Configuring Claude 3 Haiku under `ap-south-1` required defensive fail-open exception handling. Any model throttling or transient Bedrock latency spikes could easily disrupt local developers if Bedrock were allowed near the critical path.

---

## 4. What did you LIKE about the AWS services used?

- **Amazon DynamoDB**:
  Blazing single-digit millisecond query performance on composite primary keys. The on-demand capacity mode (`PAY_PER_REQUEST`) meant zero billing while idle and zero capacity planning for hackathon workloads.
- **AWS Lambda**:
  True serverless agility. Handling sudden bursts when multiple developer hooks and agents trigger simultaneously required zero operational overhead, and IAM policy shorthand (`DynamoDBReadPolicy`, `DynamoDBCrudPolicy`) simplified least-privilege permissions.
- **Amazon Bedrock**:
  Clean, unified API via the `@aws-sdk/client-bedrock-runtime` without managing custom containers, dedicated endpoints, or third-party API keys. Using Claude 3 Haiku through AWS IAM credentials felt secure and cloud-native.

---

## 5. Team Contributions

*(Use this template and replace placeholders)*

- **[TODO: Team Member 1 Name]** ([TODO: GitHub handle]):
  - **Role**: [TODO: e.g., Architecture & Serverless Backend]
  - **Contributions**: Implemented the AWS SAM infrastructure (`infra/template.yaml`), Lambda service handlers (`services/ingest`, `services/context`, `services/verdict`), and DynamoDB single-table schema design. Authored [TODO: commits or PR numbers].
- **[TODO: Team Member 2 Name]** ([TODO: GitHub handle]):
  - **Role**: [TODO: e.g., Deterministic Engine & Shared Contracts]
  - **Contributions**: Developed `@mergelab/shared` Zod schemas and the `@mergelab/resolver` deterministic rule engine (implementing DEP_CONFLICT, NAMING_DRIFT, DUP_SYMBOL, ROUTE_COLLISION, SHAPE_MISMATCH, and STALE_BINDING). Authored [TODO: commits or PR numbers].
- **[TODO: Team Member 3 Name]** ([TODO: GitHub handle]):
  - **Role**: [TODO: e.g., CLI Daemon & AST Extractor]
  - **Contributions**: Built the `ts-morph` AST extraction pipeline (`packages/extractor`), secret redactor, working-tree git observer, and the `mergelab` CLI publisher (`packages/daemon`). Authored [TODO: commits or PR numbers].
- **[TODO: Team Member 4 Name]** ([TODO: GitHub handle]):
  - **Role**: [TODO: e.g., Agent Hooks & Projector UI / Bedrock Semantic Tier]
  - **Contributions**: Integrated Claude Code and Cursor hooks (`packages/hooks`), implemented the Amazon Bedrock Claude 3 Haiku advisory tier (`services/semantic`), and built the real-time React dashboard projector (`board`). Authored [TODO: commits or PR numbers].
