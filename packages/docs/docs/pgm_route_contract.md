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
| Tema N ILU (open) | DoubleBox (3) | `route://3` | wipe on **PGM 200** | Route hard-cuts at wipe cut point (~760 ms); `db_loop` + cam + countup |
| Tema N SYN | Full (4) | `route://4` | hard cut | |
| Tema N ILU (return) | DoubleBox (3) | `route://3` | hard cut | |
| SJV / ŠPORT / Počasie / tip open | Full (4) | `route://4` | themed wipe on **PGM 200** | Route hard-cuts at wipe cut point (~760 ms); Full pre-built |
| SYN avízo / last words | Full (4) | `route://4` | hard cut | |
| Outro | Full (4) | `route://4` | `outro.mov` on PGM | |

**LED:** baseline `loops/bg_loop` fullscreen; tema / SJV / ŠPORT / Počasie parts apply a mild zoom FILL+CROP. Tip / avízo / outro return to fullscreen.

**Countup:** PGM layer 123 (above the route), not a look-compose layer.

**CAM1:** Baseline keeps `pgmCameraProducer` playing on DoubleBox ch3/115 for the rundown so the first ILU wipe is not a cold dshow open.

**Never:** `route://N-0` (empty layer → black PGM). Emit full-channel underlay as MEDIA `file: route://N` (casparcg-state coerces TSR ROUTE `layer: null` → `0`).
