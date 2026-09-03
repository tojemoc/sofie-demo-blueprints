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

- Piece type `wipe` (megarepo `assets/`) drives a **PGM route STING** on `casparcg_pgm_route` (ch2 layer 110): `PLAY route://{bgA|bgB}` with wipe media `wipes/wipe` (DEFAULT_WIPE_FILE; older pins used `wipes/360_wipe`). The standalone overlay on `casparcg_effects_player_pgm` (ch2/200) is kept as a compat mapping only.
- Story looks pre-build on **BG A** (`casparcg.hypercomposed.bgChannelA`, default 3) and **BG B** (default 4), ping-ponged per part so the on-air BG channel is never rebuilt under the route. Caspar `caspar.config` needs ≥4 channels; BG A/B are render-only (no Screen/NDI/SDI consumers).
- Piece type ids are matched case-insensitively (`wipe` / `WIPE`). Wipe uses Sofie source layer `pgm_wipe` (GFX output) so it coexists with Camera/VT.
- Bare basenames (`wipe`) are normalized to `wipes/wipe` (same for `loops/` / `assets/` on bg-loop / intro).
- `gfx/logo-bug` (360° sekúnd bug) maps to **PGM** `casparcg_graphics_logo` (ch2 layer 123) — **above** the routed look, so it is not wiped away.
- Baseline loops `assets/countup` silently from rundown take start; first DoubleBox Take fades it in (logo + seconds + SFX in one .mov).
- Set studio `casparcg.hypercomposed.pgmCameraProducer` (e.g. `dshow://video=OBS Virtual Camera`) so camera pieces also PLAY on the look's `casparcg_pgm_camera` (layer 115) with DoubleBox FILL. ILU (`casparcg_pgm_ilu_player`, layer 116) sits above CAM so left overhang is covered without CAM cover-crop.
- Piece type `doublebox-ilu` → look `casparcg_pgm_ilu_player` (layer 116) with left-window FILL; do **not** use `headline` for thematic DoubleBox.
- Baseline `loops/bg_loop` plays on **LED only** (`casparcg_clip_player1`). PGM ClipPlayer2 is the look-A VT/SYN/weather layer on BG A — never a companion bg_loop. PGM DoubleBox uses `loops/db_loop` (bg art baked into the alpha frame) — that is not a second `bg_loop` PLAY.
- Topology notes live in the sofie megarepo: `docs/integration/DOUBLEBOX-PGM.md` and ADR `docs/adr/0002-wipe-prebuild-bg-channels.md`.

### Media folder layout (bg-loop / wipe / clips)

Caspar PLAY paths are relative to the studio **CasparCG media folder** (default
`c:/casparcg/sofie-demo-media`), without file extension:

```text
<casparcgMediaFolder>/
  loops/bg_loop.mov      ← baseline + bg-loop piece → PLAY "loops/bg_loop"
  wipes/wipe.mov         ← wipe piece     → PLAY "wipes/wipe" (DEFAULT_WIPE_FILE)
  clips/...              ← VT / ILU / SYN clips (Package Manager)
```

Rundown Editor `mediaPick` `subdir` values (`loops`, `wipes`, `clips`) are picker
hints under the ingest media root — the piece `fileName` payload should already
include that prefix (e.g. `loops/bg_loop`). Two levels only: `<subdir>/<file>`.
