# board

The Handshake projector board — a single-page React + Vite app that reads
`GET /v1/board` and renders three regions: **Branches**, **Contracts** (grouped
by branch), and the **Drift feed**. It polls every 3 seconds (no websockets).

## Run

```bash
pnpm install
pnpm --filter @handshake/board dev
```

Open the printed URL. With no `VITE_API_URL` set the board runs in **demo mode**,
rendering from `fixtures/declarations.sample.json` — no backend required, so it
is presentable on its own.

To point at a deployed registry, copy `.env.example` to `.env.local` and set
`VITE_API_URL`, `VITE_API_TOKEN`, and `VITE_REPO`.

```bash
pnpm --filter @handshake/board build     # production bundle in dist/
pnpm --filter @handshake/board preview    # serve the built bundle
```

## How it works

- **One data shape.** Live mode fetches `GET /v1/board`; demo mode calls the
  same `assembleBoard()` (from `services/resolver`) that the Lambda uses, over
  the fixture. What a judge sees offline is exactly what the deployed board
  computes — no forked rendering logic.
- **Heartbeat.** A branch is *active* if it reported within 5 minutes, else
  *dormant* and labelled **"not reporting"** so absence never reads as "nobody
  is working here." Status and the "reported N ago" label share one reference
  clock, so they always agree. Demo mode anchors that clock just after the
  fixture's newest heartbeat, so one branch reads active and one dormant.
- **Findings** come straight from the deterministic rule engine
  (`runRules`); the board never re-derives them.

## Design notes

Built with the `ui-ux-pro-max` Real-Time Monitoring design system: Fira Code
for symbols/signatures, Fira Sans for prose (both with system fallbacks so the
board still looks right offline). Light is the default; dark comes via
`prefers-color-scheme` with a manual toggle override. Severity is always carried
by an icon **and** a label, never colour alone. Minimum 16px body text, large
headings, and no meaning hidden behind hover — everything needed to read the
board is on screen.
