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

CI (`.github/workflows/node.yaml`): PRs run typecheck/lint/test only (no `yarn build` /
`yarn dist`). Blueprint+docs builds, deploy image, and pre-releases run on pushes to
`develop`/`main`; tagged `v*` pushes create GitHub releases.

### Gotchas

- **Docs base path**: Docusaurus is configured with `baseUrl: /sofie-demo-blueprints/`. The dev server homepage is at `http://localhost:3030/sofie-demo-blueprints/`, not `http://localhost:3030/`.
- **Blueprint upload to Sofie**: `yarn watch-sync-local` and `yarn build-sync-local` POST bundles to `http://127.0.0.1:3000`. Sofie Core must be running separately for those commands to succeed.
- **`yarn dist` runs tests first**: The blueprints `dist` script runs `yarn test` before building bundles.
- **Peer dependency warnings** on `yarn install` (TypeScript version, docs eslint) are expected and do not block builds.

### External services (not in this repo)

Full TV automation demo requires Sofie Core r53, playout-gateway, and a rundown ingest tool (Rundown Editor or Spreadsheet Gateway). See `README.md` for the complete setup guide.

### PGM wipe + UVC camera (DoubleBox)

- Piece type `wipe` (megarepo `assets/`): **All** hypercomposed wiped Takes PLAY wipe on `casparcg_effects_player_pgm` (**ch2/205**, not 200) and hard-cut MEDIA `route://{bgA|bgB}` at `WIPE_CUT_POINT_MS` (~760 ms) — DoubleBox → ch3, Full-section (SJV / ŠPORT / Počasie / tip) → ch4. Layer 205 is a fresh mixer slot: leftover `MIXER 2-200 KEYER` from older bundles luma-keyed `wipe.mov` while `outro.mov` on 210 was fine. Overlay mixer forces **alpha-only** (`keyer: false`, `straightAlpha: true`, `blend: NORMAL`, `opacity: 1`, fullscreen FILL; **omit** `chroma` — even `NONE` made live AMCP emit `CHROMA 0 undefined…`) so remastered straight-alpha `wipe.mov` is not treated as premul/keyed. Mixer is re-asserted at `WIPE_CUT_POINT_MS` (route hard-cut sibling). Wipe pieces use ≥`DEFAULT_WIPE_PREROLL_MS` (3000 ms) so Caspar can LOADBG the alpha before Take. Do **not** use Caspar STING on the route. Default wipe file `wipes/wipe`; themed `wipes/wipe_sjv` / `_sport` / `_pocasie` pass through. `wipe_pocasie` EMPTYs Full-look clip (finite to cut) / CAM / `db_loop` and restores `loops/bg_loop` under weather; holds weather MEDIA/L3D until the cover cut so the last sport SYN cannot flash before `bg_pocasie`. `previousPartKeepaliveDuration` is the **cut point** (not full sting) so DB→DB / Full→Full switches happen under cover, not after wipe CLEAR.
- L3D HTML (`useStopCommand: true`, lookahead **NONE**): on Take, EMPTY the look L3D layer immediately (auto-hide previous / kill keepalive stack), then ADD the new L3D after `L3D_OUT_MS` (hard cut) or `lookPreroll + wipeDuration` on wiped Takes (after the sting ends; object enable is piece-relative; preroll compensation keeps on-air at Take+wipeEnd). CLEAR duration covers `objectTime + in-delay` so delayed sport L3D (`start: 1s`) cannot leave a gap for a previous CG. Same-template Takes (SJV/ŠPORT) must CLEAR then ADD — never CG UPDATE (that only swaps text). CLEAR pieces use hidden source layer `pgm_layer_clear` (**not** `gfx` — GFX is exclusiveGroup `pgm` and would prune SYN VO) and must **not** inherit look preroll. Wipe overlay starts at **0**. Look MEDIA (clips/CAM/ILU/db_loop/bg_loop) hard-cuts at `lookPreroll + WIPE_CUT_POINT_MS` on wiped Takes. Leaving Počasie clears Full-look ILU (`bg_pocasie`) at the wipe **cutpoint** (finite) so the map cannot linger into ZAVER — an open-ended ILU EMPTY would keepalive-suppress the next weather map. Retired RE type `l3d-predstavovak` coerces to `l3d-syn` (opening → `l3d-mod`).
- Outro overlay (`assets/outro` on PGM 210): mute kolíska A/C beds and countup SFX with **OutOnRundownEnd** mute pieces — beds stay quiet after the jingle; outro MEDIA uses `loop: false` and OutOnRundownEnd so the last frame freezes. Wiped Takes also WithinPart-mute kolíska beds for the sting window (piece duration includes mute preroll; sport C gets mixer duck keyframes) so `bg_music_c` does not fight `wipe_sport`.
- Piece type `ilu-zaver`: LED 115 **windowed** (~`PGM_DOUBLEBOX_ILU_FILL`, ≈60–68%) over `bg_loop`. CAM1 + `l3d-odporucanie` are PGM-only (Full look). Do **not** `route://4` onto LED.
- LED tema zoom: `MIXER 1-110 FILL -0.5425 -0.27125 1.5425 1.5425` (vMix shift 1.085 where 1.0 = 50% screen). Headlines also PLAY `assets/pod_headline` on LED **112**.
- Weather stack: `loops/bg_loop` (clip) + `assets/bg_pocasie` (ILU) + transparent `gfx/pocasie` (L3D) on Full look. Only weather GFX sets Sofie `autoNext`; SYN/VO never AUTO.
- ILU / SYN MEDIA default mixer volume **0.5** when RE leaves volume unset; VO clips use `loop: false` with **no** piece.enable.duration so the last frame holds until Take.
- Story looks compose on fixed semantic channels: **BG A / DoubleBox** (`casparcg.hypercomposed.bgChannelA`, default 3) and **BG B / Full** (default 4). DoubleBox parts (rawType / `gfx/doublebox-ilu`) always use ch3; headlines, SYN/VT/weather, and fullscreen camera always use ch4 (`route://4`). Remote / Titles / DVE peek the last look; Intro keeps Full underlay (`route://4`) beneath the PGM overlay. Caspar `caspar.config` needs ≥4 channels; BG A/B are render-only (no Screen/NDI/SDI consumers — NDI on 3/4 is fine for monitoring only).
- Piece type ids are matched case-insensitively (`wipe` / `WIPE`). Wipe uses Sofie source layer `pgm_wipe` (GFX output) so it coexists with Camera/VT.
- Bare basenames (`wipe`) are normalized to `wipes/wipe` (same for `loops/` / `assets/` on bg-loop / intro).
- `gfx/logo-bug` (360° sekúnd bug) maps to **PGM** `casparcg_graphics_logo` (ch2 layer 123) — **above** the routed look, so it is not wiped away.
- Baseline loops `assets/countup` is **not** started at rundown take; first DoubleBox Take fades it in (logo + seconds + SFX in one .mov).
- Set studio `casparcg.hypercomposed.pgmCameraProducer` (e.g. `dshow://video=OBS Virtual Camera`, or `DECKLINK DEVICE 1 FORMAT 1080p5000`). Live CAM opens **once** on `camIngestChannel` (default Caspar **5**, mapping `casparcg_pgm_camera_ingest`). Look camera layers PLAY MEDIA `route://5` with DoubleBox FILL on ch3 or fullscreen FILL on Full ch4 (`casparcg_pgm_camera_b`) — never a second DeckLink/dshow on 3-115/4-115. `caspar.config` needs **≥5** channels. ILU (`casparcg_pgm_ilu_player`, layer 116) sits above CAM so left overhang is covered without CAM cover-crop. DeckLink must be TSR INPUT on ingest (not quoted MEDIA). AMCP must include `DEVICE` — sofie-core Yarn-patches `casparcg-connection` so PlayDecklink emits `DECKLINK DEVICE <n>`; rebuild/restart playout-gateway to pick that up (blueprint re-upload alone is not enough for the DEVICE keyword).
- PGM underlay must be AMCP `route://N` (full channel). Do **not** emit `route://N-0` (empty layer → black PGM). Blueprints use MEDIA `file: route://N` because casparcg-state coerces TSR ROUTE `layer: null` to `0`.
- Piece type `doublebox-ilu` → look `casparcg_pgm_ilu_player` (layer 116) with left-window FILL; do **not** use `headline` for thematic DoubleBox.
- Baseline `loops/bg_loop` plays on **LED** (`casparcg_clip_player1`) and, when hypercomposed, also on **Full BG B** (`casparcg_clip_player2_b`) for rehearsal/headlines/Privítanie. Story SYN/VT/weather override that Full clip layer. PGM DoubleBox uses `loops/db_loop` on ch3 (bg art baked into the alpha frame) — that is not a second `bg_loop` PLAY on DoubleBox.
- Topology notes live in the sofie megarepo: `docs/integration/DOUBLEBOX-PGM.md` and ADR `docs/adr/0002-wipe-prebuild-bg-channels.md`. Docs in this repo: `packages/docs/docs/pgm_route_contract.md`.

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
