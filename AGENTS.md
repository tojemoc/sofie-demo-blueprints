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

- Piece type `wipe` (megarepo `assets/`): **All** hypercomposed wiped Takes PLAY wipe on a PGM EffectsPlayer mapping and hard-cut MEDIA `route://{bgA|bgB}` at **air cut** = editorial `cutPoint` ms into the wipe file (RE payload; default `WIPE_CUT_POINT_MS` **380 ms**) **+** half-frame cover centre (**10 ms**, classical + themed — same cover structure) **+** `WIPE_PLAYOUT_LATENCY_MS` / studio Setting **Wipe playout latency** (**380 ms**), snapped to 50fps — lands on Resolve cover centre ~**780 ms** (source `wipe.mov` frames **19–20 @25fps** = timeline **760–840 ms**; 30fps captures frames 23–24). Same-slot look MEDIA leads by **5f** (`SAME_SLOT_WIPE_AIR_CUT_LEAD_MS`); leave-weather ZAVER **lags** look/WX-hide by **4f** past air cut (`LEAVE_WEATHER_WIPE_AIR_CUT_LAG_MS`, no same-slot lead). Hard-cut route headroom **3f** (`LOOK_HARD_CUT_ROUTE_HEADROOM_MS`). **One Sofie mapping + Caspar layer per wipe file** — classical `wipes/wipe` → **205**, `wipe_sjv` → **206**, `wipe_sport` → **207**, `wipe_pocasie` → **208 — plus sticky baseline opacity-0 LOADBG on each so idle layers never resolve to `LOADBG … "EMPTY"`. Do **not** pad air cut for Full↔DB (`CROSS_SLOT_WIPE_AIR_CUT_BIAS_MS` is retired). Sofie cannot ACK “on screen” from Caspar; EffectsPlayer PRELOAD search depth is raised so LOADBG does not miss. Hard cuts delay incoming look by **2 frames** (`LOOK_HARD_CUT_INCOMING_DELAY_MS`). Same-slot keepalive holds previous for delay + Caspar cold-PLAY latency floor + 3f route headroom (`LOOK_HARD_CUT_KEEPALIVE_MS` = **19 frames** / 380 ms — operator Latency 4–14f) so baseline Full `bg_loop` cannot fill the hole. Cross-slot idle looks LOADBG from Take, hot-PLAY at the 2f delay, and delay `route://` to the keepalive so the first frame is ready before PGM leaves the previous channel. Hard-cut Takes must **not** raise look `prerollDuration` (Camera/ILU) — Sofie `toPartDelay` would hold content ~1.5s past keepalive (AMCP: LOAD at Take, `route://` ~1.8s later → black blink). DB→Full wipes must **not** EMPTY the Full clip layer (prio-2 EMPTY evicted LOADBG → brief `bg_loop` under the sting); `wipe_pocasie` still EMPTYs clip for weather bg_loop. Abutting 2f===2f in #120 flashed black; #121 4f keepalive still lost to Caspar Latency → `bg_loop` flash. DoubleBox / Full **kind** (FILL / db_loop) is independent of physical A/B — Takes ping-pong idle channels so same-slot cold PLAY is rare. Layer 205 is a fresh mixer slot vs retired 200 (leftover `MIXER KEYER`). Overlay mixer is **alpha-only** (`keyer: false`, `blend: NORMAL`, `opacity: 1`, fullscreen FILL; **omit** `chroma` — even `NONE` → broken `CHROMA … undefined` AMCP). Do **not** set layer `straightAlpha` — casparcg-state only emits it as channel `STRAIGHT_ALPHA_OUTPUT`. Remastered straight-alpha `wipe.mov` is converted with MEDIA `videoFilter: premultiply=inplace=1` (`PLAY … FILTER …`) so Caspar’s premul compositor looks correct. Wipe pieces use ≥`DEFAULT_WIPE_PREROLL_MS` (3000 ms) **and** `pieceType: InTransition` so Sofie `calculatePartPreroll` / `toPartDelay` ignore that preroll (otherwise look MEDIA / bed C land ~3s late, after wipe CLEAR) while the wipe child-group still LOADBGs ahead of Take. Do **not** use Caspar STING on the route. Default wipe file `wipes/wipe`; themed `wipes/wipe_sjv` / `_sport` / `_pocasie` pass through and are **duration-capped** to their animation length (`THEMED_WIPE_ANIMATION_MS` — RE’s 2500 ms otherwise freezes the last frame). Look compose mappings (clip / ILU / `db_loop`) use Lookahead **NONE** — PRELOAD LOADBGs the next Take onto the live layer under the wipe (DB ILU cut, Full black blink, stray `db_loop` on ZAVER). PGM EffectsPlayer mappings stay PRELOAD for the sting. Full→Full wipes (SJV→ŠPORT, ŠPORT→Počasie) must **not** EMPTY the live clip (that blacks `route://4` under the sting); keepalive + delayed incoming at the cut is enough. DoubleBox→Full may still EMPTY stale ch4 under cover. DoubleBox wiped Takes **never** EMPTY look A. Every wiped Full Take EMPTYs the **other** slot’s `db_loop`. Idle look channel under wipe (every ping-pong Take): LOAD/PAUSE all compose MEDIA from Take (`playing: false`), hot PLAY at air cut (first frame ready under cover; audio ducked for sting). Same-slot (rare after ping-pong): `enable.start` = air cut − `SAME_SLOT_WIPE_AIR_CUT_LEAD_MS`; never pause/seek from Take (that LOAD replaces on-air). Wipe overlay / PGM `route://` / countup keep the full air cut. `db_loop` stays at enable 0. `previousPartKeepaliveDuration` is the **look cut** so switches happen under cover, not after wipe CLEAR. Look MEDIA `postrollDuration` always reserves ≥`DEFAULT_WIPE_DURATION_MS` (2500) on wiped Takes; hard cuts use `LOOK_HARD_CUT_POSTROLL_MS` (**760** ms = legacy cover + 19f keepalive @50fps). After segment generation Sofie also raises each part to the next on-air wipe's keepalive when that exceeds the floor, **and** raises the last on-air part of every segment to the full-sting floor so a wiped Take on the *next* segment keeps picture (within-segment raise cannot see cross-segment wipes). Leaving Počasie into wiped ZAVER: clear Full-look ILU (`bg_pocasie`) + previous weather L3D and delay LED `ilu-zaver` to **air cut + `LOOK_HARD_CUT_OVERLAP_MS`** (`leaveWeatherHideMs`; wipe overlay still starts at Take 0) so WX hide / LED switch happen under cover — not before the sting is on PGM.
- L3D HTML (`useStopCommand: true`, lookahead **NONE**): on Take, EMPTY the look L3D layer immediately (auto-hide previous / kill keepalive stack), then ADD the new L3D after `L3D_OUT_MS` (hard cut) or `wipeDuration` on wiped Takes (after the sting ends; object `enable.start` is **Take-relative** — `prerollDuration` is media lookahead only and must not be baked into enable). CLEAR duration covers `objectTime + in-delay` so delayed sport L3D (`start: 1s`) cannot leave a gap for a previous CG. Same-template Takes (SJV/ŠPORT) must CLEAR then ADD — never CG UPDATE (that only swaps text). CLEAR pieces use hidden source layer `pgm_layer_clear` (**not** `gfx` — GFX is exclusiveGroup `pgm` and would prune SYN VO) and must **not** inherit look preroll. L3D templates **and** editorial look MEDIA (VO/VT/ILU/GFX) skip look preroll on wiped Takes so Sofie does not hold them until Take+preroll. Wipe overlay starts at **0**. Look MEDIA (clips/CAM/ILU/db_loop/bg_loop) hard-cuts at the editorial wipe cut point on wiped Takes. Leaving Počasie into wiped ZAVER clears Full-look ILU (`bg_pocasie`) with an **open-ended** EMPTY starting at `leaveWeatherHideMs` (air cut + `LOOK_HARD_CUT_OVERLAP_MS`) so the map cannot linger into ZAVER — open-ended is safe here (next Take is Outro, not weather). Retired RE type `l3d-predstavovak` coerces to `l3d-syn` (opening → `l3d-mod`).
- Outro overlay (`assets/outro` on PGM 210): mute kolíska A/C beds and countup SFX with **OutOnRundownEnd** mute pieces — beds stay quiet after the jingle; outro MEDIA uses `loop: false` and OutOnRundownEnd so the last frame freezes. Wiped Takes also WithinPart-mute kolíska beds for the sting window (piece duration includes mute preroll; sport C gets mixer duck keyframes) so `bg_music_c` does not fight `wipe_sport`.
- Piece type `ilu-zaver`: LED 115 **windowed** (~`PGM_DOUBLEBOX_ILU_FILL`, ≈60–68%) over LED `bg_loop`. ZAVER+AVIZO is **Full kind** (fullscreen CAM `route://5`, companion `bg_loop`, **no** `db_loop`) on the idle look channel — never EMPTY look cam when the part owns it. Wiped ZAVER also EMPTYs look ILU so `bg_pocasie` cannot linger. On Take, also EMPTY the **other** look slot (`db_loop` / ILU / CAM / L3D) so a leftover DoubleBox frame cannot survive into závěr. `db_loop` lifespan is **OutOnSegmentEnd** (not OutOnRundownEnd) so it dies with the tema segment. LED `ilu-zaver` is **OutOnRundownEnd** so it stays on the wall through Outro (outro.mov wipe-like IN — clearing at Take to Outro flashed empty LED before cover). Do **not** `route://4` onto LED.
- LED tema zoom: `MIXER 1-110 FILL -0.5425 -0.27125 1.5425 1.5425` (vMix shift 1.085 where 1.0 = 50% screen). Headlines also PLAY `assets/pod_headline` on LED **112** from **baseline** (Activate/Rehearsal); cleared on first DoubleBox Take.
- Weather stack: `loops/bg_loop` (clip) + `assets/bg_pocasie` (ILU) + transparent `gfx/pocasie` (L3D) on Full look. Weather GFX sets Sofie `autoNext`; timed SYN/VO (`payload.duration > 0`) also AUTO.
- ILU / SYN MEDIA default mixer volume **0.5** when RE leaves volume unset; VO clips use `loop: false` with **no** piece.enable.duration so the last frame holds until Take.
- Story looks compose on physical channels **BG A** (`casparcg.hypercomposed.bgChannelA`, default 3) and **BG B** (default 4). Look-bearing Takes **ping-pong** the idle channel (`claimIdle`) so compose MEDIA always LOADBGs off-air before PGM `route://` flips — only a preloaded look goes live. Editorial **kind** (DoubleBox FILL + `db_loop` vs Full fullscreen) is independent of A/B. Remote / Titles / DVE peek the last claimed look; Intro also claims idle. Caspar `caspar.config` needs ≥4 channels; BG A/B are render-only (no Screen/NDI/SDI consumers — NDI on 3/4 is fine for monitoring only).
- Baseline sticky wipe cues (`while:1`, priority 0, `playing: false`, opacity/volume **0**) on EffectsPlayers **205–208** keep LOADBG alive when Sofie lookahead resolves to nothing — without them TSR emits `LOADBG … "EMPTY"` and destroys the next Take’s PRELOAD (cold PLAY 10–14f late). WithinPart wipe pieces (priority 1) hot-PLAY with full opacity over the sticky cue.
- **Black-frame DIAG**: CasparCG Diagnostics shows a black PGM frame as a sharp **magenta `mix-time` dip** on the PGM channel (often synced on LED ch1 + PGM ch2). Screen consumers may spike `dropped-frame` at the same tick. Prefer this over guessing from AMCP timestamps; a clean hard cut / wipe should leave `mix-time` flat.
- Piece type ids are matched case-insensitively (`wipe` / `WIPE`). Wipe uses Sofie source layer `pgm_wipe` (GFX output) so it coexists with Camera/VT.
- Bare basenames (`wipe`) are normalized to `wipes/wipe` (same for `loops/` / `assets/` on bg-loop / intro).
- `gfx/logo-bug` (360° sekúnd bug) maps to **PGM** `casparcg_graphics_logo` (ch2 layer 123) — **above** the routed look, so it is not wiped away.
- Baseline does **not** PLAY `assets/countup` — first DoubleBox Take starts PLAY (opacity/volume 0 → fade) after L3D-mod is gone. Intro must **not** PLAY/mute countup either (a mute piece would start PLAY at opacity 1 under the overlay). On a **wiped** first tema, countup LOADBGs from Take (`playing: false`, opacity 0) and hot-PLAYs + fades at the wipe **air cut** (`resolveWipeAirCutMs` — same instant as the `route://` hard-cut) so it appears **under** the sting — never audible/visible at Take before the cover. PGM EffectsPlayer wipe overlay uses explicit LOADBG→hot PLAY (`playing: false` + keyframe `playing: true` at Take) plus Lookahead **PRELOAD** while Next (NONE cold-started PLAY ~1s late and the cut flashed under an incomplete wipe).
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
