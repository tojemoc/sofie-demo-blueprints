# Companion to Sofie Migration Guide

This guide explains how to translate Bitfocus Companion button automations into Sofie demo blueprints, using the **vMix Studio** config preset and the new `vmixSources` / `vmixAutomationMacros` studio settings.

## Architecture difference

| Companion | Sofie |
|-----------|-------|
| Button press fires immediate HTTP/TCP commands | Rundown-driven **timeline state** sent via TSR |
| Custom variables (`$(custom:...)`) hold runtime state | Studio config + adLib pieces/actions |
| `logic_if` / `wait` inside button steps | `vmixAutomationMacros` steps with `wait` offsets |
| Per-page button grids | Global adLib shelf + tagged filtering |

Sofie remains the **source of truth** for on-air state. Companion can coexist as a hardware panel that triggers Sofie adLibs via [Device Triggers](https://sofie-automation.github.io/sofie-core/), but direct vMix HTTP shortcuts from both systems simultaneously will conflict.

## Step 1: Map vMix inputs (`vmixSources`)

For each vMix input you want on the Sofie shelf, add an entry in **Studio Blueprint Config → vMix Sources**:

```json
"cam1": {
  "input": 1,
  "type": "camera",
  "label": "CAM 1",
  "category": "video",
  "tags": ["studio", "rozhovor"],
  "defaultVolume": 100
}
```

| Field | Companion equivalent | Purpose |
|-------|-------------------|---------|
| `input` | vMix input number in `programCut` | Which vMix input to target |
| `type` | Implicit from button page context | Sofie source layer (camera, remote, graphics…) |
| `label` | Button label text | Shelf display name |
| `category` | Page grouping (STUDIO / SPRAVY) | Shelf ordering: video → technical → graphics |
| `overlayChannel` | Overlay 1–4 in `overlayFunctions` | Default overlay bus for graphics sources |
| `tags` | Page name / custom variable namespace | Filter shelf items (e.g. `spravy`, `weather`) |
| `defaultVolume` | `setInputVolume` on cut buttons | Auto-apply volume when cutting to source |

You do **not** need to list all 127 vMix inputs — only those operators should control from Sofie.

### Auto-generated adLibs (per source)

For each configured source, Sofie generates shelf items:

- **Cut:** program take
- **Preview:** preview bus
- **Overlay IN/OUT:** for graphics sources or sources with `overlayChannel`
- **Play / Restart:** for media player / video category sources

Plus studio-wide toggles: REC ON/OFF, STREAM ON/OFF, EXTERNAL ON/OFF.

## Step 2: Translate button macros (`vmixAutomationMacros`)

Companion buttons with multiple actions become named macros:

```json
"wait_n_cut_cam1": {
  "label": "Wait n Cut CAM1",
  "tags": ["studio", "rozhovor"],
  "steps": [
    { "action": "previewInput", "sourceKey": "cam1" },
    { "action": "wait", "delayMs": 1000 },
    { "action": "programCut", "sourceKey": "cam1" }
  ]
}
```

### Action mapping table

| Companion `definitionId` | Sofie `action` | Notes |
|--------------------------|----------------|-------|
| `programCut` | `programCut` | Use `sourceKey` or `input` |
| `previewInput` | `previewInput` | |
| `overlayFunctions` In | `overlayIn` | Set `overlayChannel` 1–4 |
| `overlayFunctions` Out/Off | `overlayOut` / `overlayOff` | |
| `setInputVolume` | `audioVolume` | `volume`, optional `fadeMs` |
| `videoActions` Play | `videoPlay` | |
| `videoActions` Pause | `videoPause` | |
| `videoActions` Restart | `videoRestart` | |
| `wait` | `wait` | `delayMs` |
| HTTP `get` | `httpGet` | `url` — Keynote `/next`, vMix `AddInput` API |
| vMix TSR actions | `tsrAction` | `tsrActionId`: `browserReload`, `lastPreset`, etc. |

Macros appear as **global adLib actions** (not timeline pieces) and execute steps sequentially.

## Step 3: What stays outside Sofie

These Companion integrations are **not** replicated in demo blueprints and need separate handling:

| Integration | Recommendation |
|-------------|----------------|
| **Home Assistant** | Dedicated TSR HTTP device or external orchestrator; trigger via `httpGet` macro step |
| **ATEM** | Separate ATEM studio config, or remove if vMix-only |
| **OBS** | OBS TSR integration or Companion-only for newsroom TVs |
| **Google Sheets** | Rundown ingest (Spreadsheet Gateway / Rundown Editor) replaces sheet-driven loads |
| **Stream Deck Timer** | Sofie countdown / part timing |

## Step 4: Example — "Load z riadka" (Sheet-driven video load)

Companion button flow:

1. Read Google Sheets cell for file path
2. HTTP GET `AddInput&Value=Video|path\file.mov`
3. Wait + conditional fallback
4. Play + set volume

Sofie equivalent:

1. **Ingest** the clip path into the rundown as a VT part (Spreadsheet Gateway / Rundown Editor)
2. Or add a macro with `httpGet` step pointing at your vMix API proxy:
   ```json
   { "action": "httpGet", "url": "http://127.0.0.1:8088/api/?Function=AddInput&Value=Video|D:\\media\\HEADLINE1.mov" }
   ```
3. Follow with `{ "action": "videoPlay", "sourceKey": "ilu_player" }`

Dynamic sheet-driven paths belong in **rundown data**, not static studio config.

### Automated import

Use the [Companion import tool](./companion-import-tool.md) to generate a starting `vmixSources` / `vmixAutomationMacros` JSON from your Companion backup and vMix `.vmix` project file:

```bash
yarn import:companion companion-backup.json --vmix-xml show.vmix --out studio-config.spravy.json
```

## Step 5: Enable the vMix preset

1. Upload rebuilt blueprints (`yarn dist` in `packages/blueprints`)
2. In Sofie: **Settings → Studio → Blueprint Config**
3. Select preset **"vMix Studio (granular sources + Companion macros)"**
4. Adjust `vmixSources` input numbers to match your vMix project
5. Run migration → Reload Baseline → restart Playout Gateway

## Companion coexistence (optional)

To keep Companion hardware while Sofie owns playout:

1. Disable vMix connection in Companion (or use read-only feedback)
2. Map Companion buttons to Sofie [Device Triggers](https://sofie-automation.github.io/sofie-core/) that fire adLib external IDs
3. Match external IDs: `vmix-cut-cam1`, `vmix-macro:spravy_head_start`, etc.

This avoids two controllers sending conflicting vMix commands.
