---
sidebar_position: 9
---

# PGM route contract (Správy hypercomposed)

Canonical Take → Caspar routing for the four-channel studio (LED=1, PGM=2, DoubleBox=3, Full=4). Use this when reading CCG AMCP logs.

| Part | Compose | PGM route | Transition | Notes |
|------|---------|-----------|------------|-------|
| Rehearsal Ready | Full (4) | `route://4` | — | Baseline: LED + Full `bg_loop`; PGM holds Full route |
| Headline 1–3 | Full (4) | `route://4` | hard cut | Full companion `bg_loop` + cam + L3D |
| Intro | Full underlay (4) | `route://4` | `intro.mov` on PGM 210 | Overlay on PGM; no `4→3` under intro |
| Privítanie (Cam) | Full (4) | `route://4` | — | Fullscreen cam + `l3d-predstavovak` |
| Tema N ILU (open) | DoubleBox (3) | `route://3` | wipe on **PGM 205** from Take | Overlay at 0; route hard-cuts at `WIPE_CUT_POINT_MS`; keepalive previous look through sting; `db_loop` + cam + countup |
| Tema N SYN | Full (4) | `route://4` | hard cut | L3D ADD after short `L3D_OUT_MS` |
| Tema N ILU (return) | DoubleBox (3) | `route://3` | hard cut | |
| SJV / ŠPORT / Počasie / tip open | Full (4) | `route://4` | themed wipe on **PGM 205** from Take | `wipe_pocasie` EMPTYs ch4 clip/CAM/`db_loop` at 0; weather MEDIA/L3D at cut |
| SYN avízo / last words | Full (4) | `route://4` | hard cut | LED: windowed `ilu-zaver` (~60–68%) over `bg_loop`; PGM: CAM + L3DO |
| Outro | Full (4) | `route://4` | `outro.mov` on PGM 210 | beds/SFX muted |

**LED:** baseline `loops/bg_loop` fullscreen; tema / SJV / ŠPORT / Počasie parts apply a
right-shifted FILL+CROP (`FILL -0.5425 -0.27125 1.5425 1.5425` — vMix shift 1.085 where
1.0 = 50% of screen) so the loop covers the DoubleBox camera cutout. Tip / avízo / outro
return to fullscreen. Headlines also PLAY `assets/pod_headline` on LED layer **112**
(above bg_loop 110, under ILU 115).

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
