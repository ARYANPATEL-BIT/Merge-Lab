# Merge Lab - Repository Audit

Date: 2026-09-20. Branch: `main` @ `bc90197`. Working tree: clean.

This audit was produced by reading source and running the commands below. Where
a claim could not be verified by execution, it is marked **UNVERIFIED**. Nothing
was fixed, installed, or built; the only file written is this one.

## 0. Command results (the ground truth)

The single most important finding: **the repo does not typecheck, build, or pass
its full test suite in its current on-disk state.** The cause is not the source
code - it is that `node_modules` is out of sync with the committed lockfile. The
workspace packages (`@mergelab/shared`, `@mergelab/resolver`, `@mergelab/daemon`,
etc.) have **no symlinks under `node_modules/`**, and per-service external deps
(`@aws-sdk/*`, `aws-lambda`) are not linked into the services that declare them.
Every failure below traces back to that.

| Command | Real exit | Result |
| --- | --- | --- |
| `pnpm -r exec tsc --noEmit` | **1** | Stops at first failure (`services/auth`): `Cannot find module '@aws-sdk/*'`, `'aws-lambda'`, `'@mergelab/shared'`. Recursive exec halts on first fail, so later packages were not reached. |
| `pnpm test` | **1** | 7 suites pass (**41 tests pass**), **10 suites fail to load** (0 tests each) with `Failed to load url @mergelab/shared` / `@mergelab/daemon` / `@aws-sdk/lib-dynamodb`. Vitest summary: `10 failed | 7 passed (17)`, `Tests 41 passed (41)`. |
| `pnpm --filter @handshake/resolver test:scenarios` | 0 | **`No projects matched the filters`** - the package was renamed; this exact command from the task is stale. |
| `pnpm --filter @mergelab/resolver test:scenarios` (real name) | **1** | `Failed to load url @mergelab/shared ... in services/resolver/src/rules.ts` - same missing-symlink cause. |
| `pnpm build` | **2** | `packages/shared` builds and emits `dist/`. `packages/extractor` then fails: `Cannot find module '@mergelab/shared'` (x7) plus `redactor.ts(56,53): TS2345`. Recursive run halts there. |
| `git log --oneline -20` | 0 | 20 commits, oldest `1fe78cc`, newest `bc90197` (merge of PR #4). Rename to mergelab landed in `226653f`. |
| `git status` | 0 | Clean, up to date with `origin/main`. |

Notes on the failures:
- The lockfile is **not** stale: `pnpm-lock.yaml` contains all 11 workspace
  importers and 18 `mergelab` references, **zero** `handshake` references.
- `redactor.ts(56,53): TS2345 ('unknown' not assignable to 'string')` appears in
  the same file whose `@mergelab/shared` import is unresolved, so `Declaration`
  is untyped and `value` widens to `unknown`. This is **most likely a cascade**
  of the missing symlink, not an independent defect. **UNVERIFIED** - I did not
  run `pnpm install` and re-build to confirm it disappears.
- Whether a clean `pnpm install` makes typecheck/build/test all pass is the
  obvious next step and is **UNVERIFIED** here, because the audit is read-only
  and I did not run install. All evidence (correct lockfile, `package.json`
  `main`/`types` pointing at `src/index.ts`, 41 tests already green) points to
  yes, but I did not prove it.

## 1. Verified state

Test counts below: "pass" = actually executed and passed in this run; "defined,
0 run" = `it()`/`test()` blocks that exist in the file but never executed because
the suite failed to load. All package assessments come from reading the source.

| Package | What it does | State | Tests |
| --- | --- | --- | --- |
| `packages/shared` | Zod schemas + inferred types (Declaration, Contract, Finding, Verdict, board + auth request/response), `shapeHash`, `functionalClassOf`, `FUNCTIONAL_CLASSES`. Single source of truth. | **Complete** (read `src/index.ts`) | 6 pass |
| `packages/extractor` | ts-morph walk → `Declaration[]`: functions, types/interfaces, env reads, routes; per-decl provides/consumes; one-level inline shape; redactor drops secrets/literals/oversized; failure → `[]` + counter. | **Complete** | 21 pass (manifest 3, redactor 13, typescript 5) |
| `services/resolver` | Six deterministic rules (`rules.ts`), version/supersession (`resolve.ts`), board projection (`board.ts`). Pure, no AWS/LLM. | **Complete** (read all three) | **0 run** (board 8, resolve 5, scenarios 1 defined - suite load fails) |
| `services/ingest` | `POST /v1/declarations`: bearer check, schema validate, `resolve()`, persist Contracts + superseded rows to DynamoDB. | **Complete** (real DDB handler) | 5 defined, **0 run** |
| `services/context` | `GET /v1/context`: bearer check, query active contracts, drop caller's owner. | **Complete** | 4 defined, **0 run** |
| `services/verdict` | `POST /v1/verdict`: bearer check, load active contracts + BIND rows, `runRules`, `decide()`. | **Complete** | 4 defined, **0 run** |
| `services/board` | `GET /v1/board`: bearer check, load all contracts + bindings, `assembleBoard`. | **Complete** | 4 defined, **0 run** |
| `services/auth` | `POST /v1/auth/signup` + `/login`: scrypt hash, timing-safe verify, writes USER/WS/TOKEN rows, returns token. | **Complete** as code (never run against real DDB) | 4 defined, **0 run** |
| `packages/daemon` | CLI (`init`/`publish`/`context`/`check`/`hook`), git working-tree read, extractor bridge, API client (schema-validated, fail-open), config (`MERGELAB_CONFIG_DIR` override), render. | **Complete** | 14 pass (config 3, identity 4, git 7); render 7 defined, **0 run** |
| `packages/hooks` | SessionStart + PreToolUse over the daemon lib; 300ms budget; fail-open. | **Complete** (read `session-start.ts`, `pre-write.ts`) | 11 defined, **0 run** |
| `board` | React + Vite projector UI + landing page + auth screens; live-or-demo data source reusing `assembleBoard`; 3s polling. | **Complete** as code; not executed by this audit | no vitest suite |

Executed total: **41 pass**. Defined-but-unrun in the 10 failed suites: **53**
(render 7, hooks 11, resolver board/resolve/scenarios 8/5/1, ingest 5, context 4,
verdict 4, board 4, auth 4). So ~94 tests are defined; only 41 currently run.

"Complete" here means the code implements what its name claims when read. It does
**not** mean the tests pass in the current tree (they mostly do not load) and does
**not** mean it has run against real infrastructure (see §3).

## 2. Requirements coverage (F1-F8 + landing + rename)

| Req | Status | Proof |
| --- | --- | --- |
| **F1 working-tree observation** | **Done** | `packages/daemon/src/git.ts` `changedSourceFiles` = `git diff HEAD --name-only` + `git ls-files --others --exclude-standard`, filtered by extension and `.mergelabignore`. Reads uncommitted + untracked. |
| **F2 extraction** | **Done** | `packages/extractor/src/typescript.ts` (ts-morph) + `manifest.ts` (deps) + `redactor.ts`. Syntax-error → `[]` + `bumpExtractFailed()`. |
| **F3 registry** | **Done as code; never deployed** | `services/ingest` writes, `infra/template.yaml` DynamoDB single table + GSI1. Persistence code real; no live table (see §3). |
| **F4 context injection** | **Done as code** | `packages/hooks/src/session-start.ts` → `getContext` → `renderContext`; empty result prints nothing. |
| **F5 drift detection** | **Done** | `services/resolver/src/rules.ts` - six rules (DEP_CONFLICT, NAMING_DRIFT, DUP_SYMBOL, ROUTE_COLLISION, SHAPE_MISMATCH, STALE_BINDING). Pure. |
| **F6 enforcement** | **Done as code** | `packages/hooks/src/pre-write.ts` - block only on `block` verdict under `block` mode; 300ms `AbortController`; fail-open on any error. |
| **F7 coupling graph** | **Cut / partial** | No persisted provider→consumer graph. `runRules` sees only request declarations + active contracts. STALE_BINDING reads `BIND#` rows, but **no code writes them** (confirmed: no `BIND#` PutCommand anywhere), so it can never fire in practice. README/infra both admit this. |
| **F8 board** | **Done as code** | `services/board` handler + `board/` React UI; `assembleBoard` shared between deployed board and demo mode (`board/src/data.ts`). Demo mode works offline; live mode UNVERIFIED (no backend). |
| **Landing page** | **Done** | `board/src/landing/*`. Renders rule reasons/context block from real engine output. One false stat - see §4. |
| **Rename (Handshake→Merge Lab)** | **Done in code** | `grep -i handshake` over non-node_modules source: **0 matches**. Only the *task prompt's* `@handshake/resolver` filter is stale. |

## 3. Unverified claims

**Nothing in this system has run against real AWS.** Everything "backend" has
only ever executed against mocks, the local demo fixture, or not at all.

- **AWS services named in `infra/template.yaml`** (5 Lambda functions, not 3):
  `IngestFunction`, `ContextFunction`, `VerdictFunction`, `BoardFunction`,
  `AuthFunction`; one `AWS::DynamoDB::Table` (`mergelab`, PK/SK + GSI1); one
  `AWS::Serverless::HttpApi` (implicit `ServerlessHttpApi`); esbuild build
  metadata per function; IAM policies (`DynamoDBCrudPolicy`/`DynamoDBReadPolicy`).
- **Deployed?** No. There is **no `samconfig.toml`**, no `.aws-sam/` build dir,
  no recorded stack. `infra/README.md` itself states: *"`sam build`/`deploy` were
  **not** run in the environment that produced this - only typecheck,"* and warns
  the esbuild `Handler` path may need flipping. So SAM build success is
  **UNVERIFIED**, deploy is **not done**, and the `ApiUrl` output has never existed.
- **DynamoDB access patterns** (single-table PK/SK, GSI1, pagination loops in
  ingest/context/verdict/board): validated only by `aws-sdk-client-mock` unit
  tests - and those tests **do not currently run** (suite load fails). No query
  has hit a real table.
- **`services/auth`** (scrypt signup/login, USER/WS/TOKEN rows): code is complete
  but has **never** executed against DynamoDB; its 4 tests do not load.
- **Hooks inside Claude Code**: `session-start` / `pre-write` are wired to a bin,
  but there is no evidence they have been exercised by a real Claude Code
  PreToolUse/SessionStart event; only unit tests exist (and they don't run).
- **300ms verdict budget**: enforced in code via `AbortController`; never measured
  against a live endpoint.
- **Board "Live" mode**: `fetchBoard` against a real `/v1/board` is **UNVERIFIED**;
  only demo mode (bundled fixture via `assembleBoard`) has any chance of working
  offline, and even that was not executed in this audit.

## 4. Inconsistencies

1. **Landing stat "95 passing tests" is false as the repo stands.** Only **41**
   tests pass; ~53 more are defined but do not load. `board/src/landing/content.ts:128`
   claims `95` under a comment insisting "Do not add numbers that are not true of
   the repo." 95 is near the *defined* total (~94), not the *passing* total.
2. **`infra/README.md` says "three Lambdas (`ingest`, `context`, `verdict`)"**
   but `template.yaml` defines **five** functions (adds `board`, `auth`). The
   infra README predates the board and auth handlers and was not updated.
3. **Landing `AWS_SERVICES` mis-describes Lambda** as "Ingest, context and verdict
   handlers" (`content.ts:140`) - omits the board and auth handlers that
   `template.yaml` provisions. Same 3-vs-5 drift as #2.
4. **Root `README.md` architecture diagram shows a "resolver Lambda" that does not
   exist.** The mermaid graph and the layout table (`README.md:20`, `:54`) depict
   `services/resolver` as a deployed Lambda talking to DynamoDB. In reality
   `services/resolver` is a **pure library** with no handler and no function in
   `template.yaml`. The diagram also omits the board-polls-API path's real
   `BoardFunction` and the `auth` endpoints.
5. **README top calls it a daemon that "watches each dev's working tree,"** but
   `packages/daemon/src/index.ts` explicitly states *"Not a filesystem watcher - a
   command you run."* The landing copy is more accurate ("walks your working
   tree"). "Watches" overstates; it is a manual/hook-invoked CLI.
6. **README "Running the Scenarios Table" is wrong.** `README.md:71` says
   `pnpm --filter @mergelab/resolver run test`; the scenarios script is actually
   `test:scenarios` (`vite-node scripts/scenarios-table.ts`). `run test` runs the
   vitest suite, not the table.
7. **README getting-started (`pnpm install && pnpm typecheck && pnpm test`) does
   not currently pass** end-to-end in this tree (typecheck and test both fail on
   the missing symlinks). The "one-command local setup" is aspirational until a
   working install is proven.
8. No stale `handshake` names, no `TODO`/`FIXME`/`HACK`, no commented-out dead
   blocks found in source (only the CLAUDE.md rule *mentioning* the word TODO).

## 5. Gaps and risks (ordered by demo blast radius)

1. **Install/build is broken on disk right now.** If a judge clones or you open
   cold and run `pnpm test`/`pnpm build`, they fail. This is the #1 demo risk. It
   is *probably* one `pnpm install` away from green, but that is UNVERIFIED and
   must be confirmed and rehearsed before any demo. Fragile.
2. **Nothing is deployed.** Any demo of the live path (daemon publish → registry →
   teammate context/verdict → board "Live") requires a first-ever `sam deploy`
   into `ap-south-1` plus the handler-path caveat the infra README warns about.
   High cost, entirely unrehearsed.
3. **The board's only proven-plausible path is demo mode**, and even that was not
   executed here. Confirm `pnpm --filter board dev` (or the built `dist/`) renders
   before relying on it.
4. **STALE_BINDING can never fire** because no code writes `BIND#` rows. If the
   demo script implies live version-drift notifications, it will silently show
   nothing. Directional rules (DEP_CONFLICT, NAMING_DRIFT, etc.) do fire.
5. **The "95 passing tests" landing stat** is a factual claim a judge can check in
   ~10 seconds and find false. Reputational risk on a page built to signal rigor.
6. **F7 coupling graph is absent**, so any pitch of "cross-service coupling
   analysis" beyond same-request + active-contract comparison is unsupported.
7. **Auth is a single static bearer token**, honestly disclosed in READMEs, but
   the landing/board auth screens imply per-user accounts. The auth Lambda backing
   them has never run against a table.

## 6. What remains

1. **[not-code]** Run `pnpm install`, then re-run `pnpm typecheck`, `pnpm test`,
   `pnpm build` and record whether they pass. Confirms/denies the whole §0 story.
   Artifact: verified green (or a real bug list).
2. **[code]** If `redactor.ts(56,53)` TS2345 survives a clean install, fix the
   `Object.entries` typing. Artifact: `packages/extractor/src/redactor.ts`.
3. **[not-code]** `cd infra && sam build && sam deploy --guided` into `ap-south-1`;
   resolve the `Handler` path caveat if `sam build` can't find the handler.
   Artifact: a live `ApiUrl`, deployed stack `mergelab`.
4. **[not-code]** Run `infra/smoke-test.ps1 -ApiUrl ... -Token ...` against the
   deployed stack; record PASS/FAIL. Artifact: smoke-test output.
5. **[code]** Add a `BIND#` row writer (endpoint or ingest side-effect) so
   STALE_BINDING can fire, or cut the rule from any live-demo narrative.
   Artifact: new handler / ingest change + `template.yaml` route.
6. **[code]** Fix the false landing stat: `95` → the real passing count.
   Artifact: `board/src/landing/content.ts:128`.
7. **[code]** Reconcile docs with the 5 deployed functions: update
   `infra/README.md` (3→5 Lambdas), landing `AWS_SERVICES`, and the root README
   architecture diagram (remove the non-existent "resolver Lambda"; add board +
   auth). Artifacts: `infra/README.md`, `board/src/landing/content.ts`, `README.md`.
8. **[code]** Fix README scenarios command (`run test` → `test:scenarios`) and the
   "watches" wording. Artifact: `README.md`.
9. **[not-code]** Execute the board (demo mode at minimum) and rehearse
   `demo-setup.ps1` end to end. Artifact: a working, timed demo run-through.
