# Companion backup import tool

Convert a Bitfocus Companion full backup (`.json`) into a Sofie **studio config** fragment with `vmixSources` and `vmixAutomationMacros`.

## Quick start

From the blueprints repo root:

```bash
yarn import:companion path/to/companion-backup.json \
  --vmix-xml path/to/show.vmix \
  --out ./studio-config.spravy.json \
  --report ./companion-import-report.txt
```

Recommended: always pass `--vmix-xml` with your vMix project file so all ~127 inputs get proper labels and categories.

## What it does

1. Parses Companion v6–v9 full backups (`pages`, `instances`, button `steps`)
2. Finds the vMix connection (host/port → `visionMixer`)
3. Converts each button's **down** action chain into a `vmixAutomationMacro`
4. Infers `vmixSources` from input numbers used in actions
5. Optionally merges names/types from a vMix `.vmix` XML project
6. Writes an import **report** listing unmapped actions, Google Sheets notes, and Správy workflow reminders

## Mapped Companion actions

| Companion action | Sofie macro step |
|------------------|------------------|
| `programCut` | `programCut` |
| `previewInput` | `previewInput` |
| `overlayFunctions` In/Out/Off | `overlayIn` / `overlayOut` / `overlayOff` |
| `setInputVolume` | `audioVolume` |
| `videoActions` Play/Pause/Restart | `videoPlay` / `videoPause` / `videoRestart` |
| `wait` | `wait` |
| HTTP `get` | `httpGet` |
| `titleAdjustText` | `httpGet` → vMix `SetText` API |
| `openPreset` | `httpGet` → vMix `OpenPreset` API |
| Custom command / `AddInput` URL | `httpGet` |

**Not auto-migrated** (flagged in report):

- `logic_if` / `logic_while` — use Sofie rundown flow instead
- Google Sheets reads — use Spreadsheet Gateway / Rundown Editor for dynamic paths
- Home Assistant, ATEM, OBS — separate integrations

## Správy production workflow (SK)

Your colleague's writeup maps to Sofie like this:

| Term | Meaning | Sofie handling |
|------|---------|----------------|
| **ILU** | Video in double-box; presenter talks over it; ILU audio quiet/muted | DVE part + low `audioVolume` on ILU input (ruch level) |
| **SYN** | Fullscreen video; presenter mic muted; video audio at full volume | Program cut to SYN input + `audioVolume` 100 |
| **Príspevok** | Any imported daily media clip (ILU or SYN segment) | Rundown VT parts per clip; one vMix input per príspevok |
| **Ruch** | Ambient audio bed under ILU (not fully muted) | `audioVolume` between mute and full (e.g. 15–30%) |

| Companion / vMix habit | Sofie approach |
|------------------------|----------------|
| Load preset (Gabi/Miso) | Macro `httpGet` OpenPreset, or show-style preset switch |
| Load z riadka (sheet → AddInput) | **Rundown ingest** with clip paths; optional watchfolder loader |
| Blue placeholder on failed load | Watchfolder / ingest validation + placeholder source in `vmixSources` |
| Per-príspevok LIST inputs | One `vmixSources` entry per contribution input (not shared lists) |
| Audio set ILU/SYN/ruch | `audioVolume` macro steps or part adapters |
| Ready to start / reset príspevky | `vmixAutomationMacros` with `videoRestart` + overlay/cut sequence |
| Next flow from Google doc | Rundown parts + transitions (not a single macro) |
| Title set text | `httpGet` SetText; bind `{{RUNDOWN_TITLE}}` to rundown fields |

### Dynamic paths

Companion URLs like:

```
http://10.33.182.163:8088/api/?Function=AddInput&Value=Video|$(Google_Sheets:0_Sheet1_A24)\HEADLINE1.mov
```

are imported with `{{RUNDOWN_PATH}}` placeholders. Replace these with rundown-driven paths in ingest, not static studio config.

## Options

| Flag | Description |
|------|-------------|
| `--vmix-xml <path>` | vMix `.vmix` project for input names |
| `--out <path>` | Output JSON (default: `./studio-config.imported.json`) |
| `--report <path>` | Text report (default: `./companion-import-report.txt`) |
| `--include-all-inputs` | Put every XML input into `vmixSources` |
| `--device-id <id>` | `visionMixer.deviceId` (default: `vmix0`) |

## After import

1. Review `companion-import-report.txt` for warnings
2. Paste/adjust `vmixSources` and `vmixAutomationMacros` into Studio Blueprint Config (vMix preset)
3. Fix input numbers if your vMix project changed since the backup
4. Replace `{{RUNDOWN_PATH}}` / `{{RUNDOWN_TITLE}}` workflows with rundown ingest
5. `yarn dist` → upload blueprints → reload baseline

## Tests

```bash
yarn test:companion-import
```
