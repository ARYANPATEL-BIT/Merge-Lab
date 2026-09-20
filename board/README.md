# board

The Merge Lab projector board - a single-page React + Vite app. `/` is the
marketing landing page; `/board` reads `GET /v1/board` and renders three regions:
**Branches**, **Contracts** (grouped by branch), and the **Drift feed**. It polls
every 3 seconds (no websockets).

## Run

```bash
pnpm install
pnpm --filter @mergelab/board dev
```

Open the printed URL. With no `VITE_API_URL` set the board runs in **demo mode**,
rendering from a bundled dataset (`src/demo.ts`) - no backend required, so it is
presentable on its own. Every demo branch is actively reporting; append
`?dormant` to the URL (or set `VITE_DEMO_DORMANT=1`) to push one branch outside
the heartbeat window and exercise the "not reporting" state.

To point at a deployed registry, copy `.env.example` to `.env.local` and set
`VITE_API_URL`, `VITE_API_TOKEN`, and `VITE_REPO`.

```bash
pnpm --filter @mergelab/board build     # production bundle in dist/
pnpm --filter @mergelab/board preview    # serve the built bundle
```

## How it works

- **One data shape.** Live mode fetches `GET /v1/board`; demo mode calls the
  same `assembleBoard()` (from `services/resolver`) that the Lambda uses, over
  the bundled dataset. What a judge sees offline is exactly what the deployed
  board computes - no forked rendering logic.
- **Heartbeat.** A branch is *active* if it reported within 5 minutes, else
  *dormant* and labelled **"not reporting"** so absence never reads as "nobody
  is working here." Status and the "reported N ago" label share one reference
  clock, so they always agree. Demo timestamps are stamped relative to load, so
  branches read live rather than frozen in the past.
- **Findings** come straight from the deterministic rule engine (`runRules`);
  the board never re-derives them. A conflict found from both branch directions
  (dep conflict, dup symbol, route collision) is collapsed to one feed entry.

## Design notes

Built with the `ui-ux-pro-max` Real-Time Monitoring design system: Fira Code
for symbols/signatures, Fira Sans for prose (both with system fallbacks so the
board still looks right offline). Light is the default; dark comes via
`prefers-color-scheme` with a manual toggle override. Severity is always carried
by an icon **and** a label, never colour alone. Minimum 16px body text, large
headings, and no meaning hidden behind hover - everything needed to read the
board is on screen.
