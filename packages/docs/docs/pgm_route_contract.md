---
sidebar_position: 9
---

# PGM route contract (Správy hypercomposed)

Canonical Take → Caspar routing for the four-channel studio (LED=1, PGM=2, DoubleBox=3, Full=4). Use this when reading CCG AMCP logs.

## Dual always-live PGM routes (no black-frame race)

PGM keeps **both** look routes live from Activate:

| PGM layer | Always playing | Baseline mixer |
|-----------|----------------|----------------|
| **2-110** | `route://3` (BG A) | opacity 0 / volume 0 |
| **2-111** | `route://4` (BG B) | opacity 1 / volume 1 |

A look cut **never** re-`PLAY`s `route://`. It enables the target layer first (opacity+volume 1), then disables the other — so a one-tick skew cannot leave a black hole on channel 2. Route carries audio, so volume swaps with opacity.

## Look compose stack (BG A / BG B)

| Layer | Role |
|-------|------|
| **110** | Sticky `loops/bg_loop` — never CLEAR/replace (shows through transparent CAM pane → blue) |
| **111** | SYN / VT / weather clip |
| **115** | CAM (`route://5`) |
| **116** | ILU |
| **118** | `db_loop` (DoubleBox) |
| **121** | L3D |

Baseline pre-warms **both** look channels with `bg_loop` + `route://5` so the first Take is RESUME-only.

| Part | Compose | PGM route | Transition | Notes |
|------|---------|-----------|------------|-------|
| Rehearsal Ready | Full (4) | `route://4` visible | — | Baseline: LED + both-look `bg_loop`; PGM shows Full route |
| Headline 1–3 | idle ping-pong | opacity swap | hard cut | companion `bg_loop` + cam + L3D |
| Intro | Full underlay | hold underlay | `intro.mov` on PGM 210 | Overlay on PGM |
| Privítanie (Cam) | idle look | opacity swap | — | Fullscreen cam + L3D |
| Tema N ILU (open) | DoubleBox | opacity→`route://N` at air cut | wipe on **PGM 205–208** from Take | Overlay at 0; route mixer swaps at air cut |
| Tema N SYN | Full | opacity swap | hard cut | L3D ADD after short `L3D_OUT_MS`; clip on **111** (bg_loop stays on **110**) |
| ZAVER + AVIZO | Full | opacity swap | hard cut / wipe | LED: windowed `ilu-zaver`; PGM: CAM + L3DO |
| Outro | Full | hold | `outro.mov` on PGM 210 | beds muted OutOnRundownEnd |

**LED:** baseline `loops/bg_loop` fullscreen; tema / SJV / ŠPORT / Počasie parts apply a
right-shifted FILL+CROP (`FILL -0.5425 -0.27125 1.5425 1.5425` — vMix shift 1.085 where
1.0 = 50% of screen) so the loop covers the DoubleBox camera cutout. Tip / avízo / outro
return to fullscreen. Headlines also PLAY `assets/pod_headline` on LED layer **112**
(above bg_loop 110, under ILU 115).

**L3D:** Take EMPTYs look layer 121 before the delayed CG ADD (`L3D_OUT_MS` / wipe cut) so
keepalive cannot stack two templates and same-name SJV/ŠPORT Takes do not CG UPDATE.
Retired `l3d-predstavovak` → `l3d-syn` (opening → `l3d-mod`).

**Wipe overlay:** PGM 205–208 mixer `keyer:false` (no chroma / no layer `straightAlpha`).
Straight-alpha `wipe.mov` applies MEDIA `videoFilter: premultiply=inplace=1` on sticky
baseline and WithinPart LOADBG/lookahead wipe objects so Take promotes with bare
`PLAY 2-20x`. Do **not** put the filter only on the hot-PLAY keyframe — that emits
`PLAY … "wipes/…" … VF "…"` and rebuilds the producer cold (self-keyed flash). A
cosmetic `LOAD … VF "…"` / File not found from casparcg-state is harmless.

**Countup:** PGM layer 123 (above the route), not a look-compose layer.

**CAM1:** Live producers open once on **CAM ingest** (`camIngestChannel`, default **5**).
Look camera layers PLAY MEDIA `route://5` with FILL (DoubleBox or fullscreen). Never
`PLAY … DECKLINK` on either `3-115` or `4-115`.

**DeckLink producer:** set studio `casparcg.hypercomposed.pgmCameraProducer` to e.g.
`DECKLINK DEVICE 1 FORMAT 1080p5000`. Blueprints map that to TSR **INPUT** on the ingest
channel only. Sofie Core’s Yarn patch on `casparcg-connection` makes playout emit
`PLAY … DECKLINK DEVICE <n> FORMAT …`. Older MEDIA bundles produced `404 PLAY FAILED` —
use blueprints ≥ #89 and Reset Rundown. If AMCP still lacks `DEVICE`, upgrade/restart
**playout-gateway**. If look layers still show `DECKLINK` on 3/4-115, upload the ch5-ingest
bundle and Reset Rundown. `caspar.config` needs **≥5** channels.

**Never:** `route://N-0` (empty layer → black PGM). Emit full-channel underlay as MEDIA `file: route://N` (casparcg-state coerces TSR ROUTE `layer: null` → `0`).

**Regression AMCP checks:** no `PLAY 2-110 "route://` / `PLAY 2-111 "route://` after Activate
(only MIXER opacity/volume); no `CLEAR [34]-110`; zero `PLAY 2-20x "wipes/` (only bare
`PLAY 2-20x`); zero `LOADBG 2-20x "EMPTY"`; sticky bg_loop on 3-110 / 4-110 for the
whole rundown.
