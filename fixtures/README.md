# Fixtures Directory

This directory contains the canonical fixtures and test data for Merge Lab. **Do not delete or modify these files as temporary scratch files**, as core test suites in `packages/extractor`, `services/resolver`, and `packages/shared` depend on their exact contents.

---

## Directory & File Manifest

### 1. `fixtures/repo-a/`
A representative TypeScript service repository representing the provider (`dev-a` on `feat/user-api`).

- **`types.ts`** (88 bytes)
  - Declares `export interface User { user_id: string; full_name: string; created_at: string; }`.
  - **Dependent Tests**: `packages/extractor/src/typescript.test.ts` ("extracts the User type; it provides itself and consumes nothing").
- **`user.ts`** (235 bytes)
  - Declares `export async function getUser(id: string): Promise<User>` importing `axios` and `User` from `./types`, referencing `process.env.DATABASE_URL`.
  - **Dependent Tests**: `packages/extractor/src/typescript.test.ts` ("per-declaration provides/consumes; getUser inlines User across files"). Verifies cross-file shape inlining where `User`'s shape is inlined one level deep into `getUser`.
- **`routes.ts`** (279 bytes)
  - Express app registering `GET /api/users/:id` and `POST /api/users`.
  - **Dependent Tests**: `packages/extractor/src/typescript.test.ts` ("routes provide their own symbol and consume only what the handler references").
- **`broken.ts`** (35 bytes)
  - Intentionally malformed syntax (`export function oops( {`).
  - **Dependent Tests**: `packages/extractor/src/typescript.test.ts` ("returns [] and bumps extractFailed on a syntax error"). Verifies the hard rule: parse failure never throws or guesses, returning `[]` and bumping `extractFailed`.

---

### 2. `fixtures/repo-b/`
A representative TypeScript consumer repository (`dev-b` on `feat/profile-ui`).

- **`profile.ts`** (221 bytes)
  - Declares `export async function loadProfile(id: string): Promise<void>` importing `getUser` from `../repo-a/user` and calling `axios.post`.
  - **Dependent Tests**: `packages/extractor/src/typescript.test.ts` ("consumes getUser by symbol; Promise<void> inlines no shape").

---

### 3. `fixtures/scenarios.ts` (4,940 bytes)
Contains the 6 deterministic drift test scenarios across `DEP_CONFLICT`, `NAMING_DRIFT`, `DUP_SYMBOL`, `ROUTE_COLLISION`, `SHAPE_MISMATCH`, and `STALE_BINDING`.

- **Dependent Tests**:
  - `services/resolver/src/scenarios.test.ts` (`pnpm --filter @mergelab/resolver run test:scenarios`).
  - Evaluates each rule against expected findings, severities (`block`, `warn`, `notify`), and reasons.

---

### 4. `fixtures/declarations.sample.json` (5,793 bytes)
A comprehensive fixture of validated `Declaration` and `Contract` objects covering functions, types, dependencies, and routes.

- **Dependent Tests**:
  - `packages/shared/src/index.test.ts` (validates schema parsing and type conformance against `ContractSchema`).
  - `infra/smoke-test.ps1` (round-trips the sample declarations through a deployed AWS API Gateway / Ingest Lambda).
