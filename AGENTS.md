# AGENTS.md

## Cursor Cloud specific instructions

This repository is a **Yarn 4 monorepo** for Sofie TV studio automation demo blueprints. It does not include Sofie Core or playout hardware — those are external dependencies for full end-to-end TV automation.

### Packages

| Package | Path | Purpose |
|---------|------|---------|
| `blueprints` | `packages/blueprints` | Builds `*-bundle.js` files for upload into Sofie Core |
| `docs` | `packages/docs` | Docusaurus documentation site |

### Prerequisites

- **Node.js 22+** (see `.node-version`)
- **Yarn 4.12.0** via Corepack (`packageManager` in root `package.json`)

### Cloud environment bootstrap

Cursor Cloud can run `bash scripts/cloud-agent-setup.sh` (also referenced from
`.cursor/environment.json`) to enable Corepack, install dependencies, and warn if the
megarepo smoke rundown is missing. Run `yarn test:blueprints` separately to verify tests.

### Shared type manifests & smoke rundown (not in this repo)

**Canonical home:** [`tojemoc/sofie` → `assets/`](https://github.com/tojemoc/sofie/tree/main/assets)

| File | Used for |
|------|----------|
| `sofie-rundown-editor-piece-types.json` | RE piece contract (keep TS graphic piece ids in sync) |
| `sofie-rundown-editor-part-types.json` | RE part presets |
| `sofie-rundown-editor-segment-types.json` | RE segment presets |
| `spravy-v3-smoke-rundown.json` | Blueprint ingest smoke tests |

Do **not** add copies under `assets/` in this repo. When this clone is nested as
`sofie/blueprints/`, tests resolve `../assets/` automatically. Standalone checkouts:

```bash
eval "$(bash scripts/fetch-sofie-megarepo-assets.sh)"
```

(or set `SOFIE_MEGAREPO_ASSETS` to a local megarepo `assets/` directory). CI runs the same
script and relies on `GITHUB_ENV`.

### Common commands (from repo root)

| Task | Command |
|------|---------|
| Install deps | `corepack enable && yarn` |
| Lint blueprints | `cd packages/blueprints && yarn lint` |
| Lint docs | `cd packages/docs && yarn lint` |
| Test | `yarn test:blueprints` |
| Build blueprints | `cd packages/blueprints && yarn dist` |
| Build docs | `yarn build:docs` |
| Docs dev server | `yarn watch:docs` (port **3030**, base path `/sofie-demo-blueprints/`) |

CI mirrors these steps in `.github/workflows/node.yaml`.

### Gotchas

- **Docs base path**: Docusaurus is configured with `baseUrl: /sofie-demo-blueprints/`. The dev server homepage is at `http://localhost:3030/sofie-demo-blueprints/`, not `http://localhost:3030/`.
- **Blueprint upload to Sofie**: `yarn watch-sync-local` and `yarn build-sync-local` POST bundles to `http://127.0.0.1:3000`. Sofie Core must be running separately for those commands to succeed.
- **`yarn dist` runs tests first**: The blueprints `dist` script runs `yarn test` before building bundles.
- **Peer dependency warnings** on `yarn install` (TypeScript version, docs eslint) are expected and do not block builds.

### External services (not in this repo)

Full TV automation demo requires Sofie Core r53, playout-gateway, and a rundown ingest tool (Rundown Editor or Spreadsheet Gateway). See `README.md` for the complete setup guide.

### PGM wipe + UVC camera (DoubleBox)

- Piece type `wipe` (megarepo `assets/`) → Caspar **PGM** mapping `casparcg_effects_player_pgm` (ch2 layer 200), file `wipes/360_wipe`.
- Piece type ids are matched case-insensitively (`wipe` / `WIPE`).
- `gfx/logo-bug` (360° sekúnd bug) maps to **PGM** `casparcg_graphics_logo` (ch2 layer 123) — not LED.
- Set studio `casparcg.hypercomposed.pgmCameraProducer` (e.g. `dshow://video=OBS Virtual Camera`) so camera pieces also PLAY on `casparcg_pgm_camera` (ch2/116) with DoubleBox FILL.
- Topology notes live in the sofie megarepo: `docs/integration/DOUBLEBOX-PGM.md`.

### Media folder layout (bg-loop / wipe / clips)

Caspar PLAY paths are relative to the studio **CasparCG media folder** (default
`c:/casparcg/sofie-demo-media`), without file extension:

```text
<casparcgMediaFolder>/
  loops/360_loop.mp4     ← bg-loop piece  → PLAY "loops/360_loop"
  wipes/360_wipe.mov     ← wipe piece     → PLAY "wipes/360_wipe"
  clips/...              ← shared demo clips
  spravy/<rundownId>/clips/...  ← per-rundown VT/ILU (Package Manager)
```

Rundown Editor `mediaPick` `subdir` values (`loops`, `wipes`, `clips`) are picker
hints under the ingest media root — the piece `fileName` payload should already
include that prefix (e.g. `loops/360_loop`).
