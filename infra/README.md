# infra (P2)

AWS SAM stack for Merge Lab: three Lambdas (`ingest`, `context`, `verdict`)
behind one HTTP API, backed by a single DynamoDB table. Region **ap-south-1**,
Node 20, arm64.

Built ahead by P1 so P2 can pick up from working code. The handlers import
`@mergelab/shared` (schemas/types) and `@mergelab/resolver` (`resolve`,
`runRules`) and **reimplement none** of that logic.

## Prerequisites

- AWS CLI + AWS SAM CLI installed and `aws configure` done (or SSO), with a
  default region of `ap-south-1`.
- Node 20 and pnpm. From the repo root run `pnpm install` once - `sam build`
  invokes the `esbuild` that pnpm links into each service's `node_modules`.

## Environment / parameters

| Name              | Where              | Purpose                                             |
| ----------------- | ------------------ | --------------------------------------------------- |
| `MergelabToken`  | deploy parameter   | Legacy static token; becomes each Lambda's `MERGELAB_TOKEN` and maps to the `default` workspace. Callers send `Authorization: Bearer <token>`. |
| `MERGELAB_TOKEN` | Lambda env (auto)  | Set from the parameter by the template. Also lets the auth service resolve the legacy token to the default workspace. |
| `TABLE_NAME`      | Lambda env (auto)  | Set to the `mergelab` table by the template.       |

## Deploy (PowerShell)

```powershell
# from repo root
pnpm install

cd infra
sam build

# first time - interactive; pick region ap-south-1 and enter MergelabToken
sam deploy --guided

# or non-interactive:
sam deploy `
  --stack-name mergelab `
  --region ap-south-1 `
  --capabilities CAPABILITY_IAM `
  --resolve-s3 `
  --no-confirm-changeset `
  --parameter-overrides "MergelabToken=<your-token>"
```

`sam deploy` prints the `ApiUrl` output. Grab it for the smoke test.

## Smoke test (PowerShell)

```powershell
./smoke-test.ps1 -ApiUrl "<ApiUrl output>" -Token "<your-token>"
```

It POSTs `fixtures/declarations.sample.json` (reduced to declarations) under a
unique throwaway `repo`, GETs `/v1/context` back, and prints `PASS`/`FAIL` on
whether every symbol round-tripped.

## Data model (DynamoDB `mergelab`)

| Entity   | PK             | SK                              | Notes                                  |
| -------- | -------------- | ------------------------------- | -------------------------------------- |
| Contract | `REPO#<repo>`  | `CONTRACT#<symbol>#v<version>`  | GSI1PK=`REPO#<repo>#BRANCH#<branch>`   |
| Binding  | `REPO#<repo>`  | `BIND#<branch>#<contract_id>`   | attrs `symbol`, `bound_version`        |

On-demand billing. `GSI1 (GSI1PK, GSI1SK)` is provisioned for consumer/branch
lookup; the current handlers query the base table by repo and don't read GSI1
yet (see below).

## Not yet built (the seams - for whoever picks this up)

- **Cognito / IAM federation** - auth is workspace tokens (`ml_ws_...`, via the auth service) plus the legacy static `MERGELAB_TOKEN` bearer; no federated identity provider.
- **EventBridge + notify Lambda** - nothing publishes/consumes change events;
  STALE_BINDING is computed on demand, not pushed.
- **GSI2** - only GSI1 exists; a second index for reverse (symbol → consumers)
  lookups is not modeled.
- **The resolver's coupling graph** - `runRules` only sees the declarations in
  the request plus active contracts; there's no persisted provider→consumer
  graph.
- **BIND row writes** - `verdict` *reads* `BIND#...` rows, but no endpoint
  *creates* them yet, so STALE_BINDING stays silent until a writer exists.
- **GSI1 reads** - the index is populated on write but unused by queries so far.
- **Status lifecycle** - only `declared` and `changed` are produced;
  `implementing` / `implemented` / `abandoned` transitions aren't managed here.
- **Shared HTTP plumbing** - auth/log/DDB helpers are duplicated per service;
  no `services/common` package (kept out to preserve the ownership layout).

## Deploy caveat (unverified here)

`sam build`/`deploy` were **not** run in the environment that produced this -
only typecheck. The esbuild handler-path convention can vary: each function
uses `CodeUri: ../services/<svc>`, `EntryPoints: [src/index.ts]`,
`Handler: src/index.handler`. If `sam build` reports the handler can't be
found, flip `Handler` to `index.handler` (esbuild `outbase` flattening).
Handlers rely on the Node 20 runtime providing `@aws-sdk/*` (marked `External`).
