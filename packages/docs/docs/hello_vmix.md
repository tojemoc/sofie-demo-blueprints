# Hello vMix — Integration Demonstration

This guide walks through connecting Sofie to vMix for the **Hello vMix** proof-of-integration workflow. It assumes you have Sofie Core (r53+), Playout Gateway, and vMix on the same network, but **no prior vMix + Sofie experience**.

## What this demonstrates

A single Rundown Editor rundown can drive observable vMix changes:

| Rundown part type | vMix action |
|-------------------|-------------|
| `CAMERA` | Program cut to input **CAMERA** |
| `LOWER THIRD` | Overlay 1 on (**LOWER_THIRD**) |
| `HEADLINE` | Overlay 2 on (**HEADLINE**) |
| `DOUBLEBOX` | Program cut to input **DOUBLEBOX** |
| `CLIP` | Start looped playback on **BG_LOOP** |
| `MIX3_FEED` | Program take on **Mix 3** to input **MIX3_FEED** |

When a graphic part ends (you take the next part), Sofie clears the timeline object and TSR sends `OVERLAY_INPUT_OUT` for that overlay channel.

---

## 1. Create a vMix project for testing

1. Open vMix and create a new preset (or duplicate an existing one).
2. Save the preset — e.g. `HelloVmixDemo.vmix`.
3. Keep the vMix **Web Controller** enabled (default TCP API port **8099**).

### Required inputs (exact names)

vMix input names are **case-sensitive**. Create these inputs with **exactly** these titles:

| Input name | Type | Purpose |
|------------|------|---------|
| `CAMERA` | Camera / Colour / Capture | Program cut demo |
| `LOWER_THIRD` | Title (GT) or Colour | Overlay channel 1 |
| `HEADLINE` | Title (GT) or Colour | Overlay channel 2 |
| `DOUBLEBOX` | MultiView or pre-built layout | Double-box program demo |
| `BG_LOOP` | Video | Looped clip playback demo |
| `MIX3_FEED` | Colour or Video | Feed routed to Mix 3 |

**Tip:** Use distinct colours per input so program/overlay changes are obvious on the multiview.

### Overlay assignment

Overlays are vMix's downstream keys (channels 1–4). The blueprint maps:

| Registry key | Overlay channel | vMix input |
|--------------|-----------------|------------|
| `LOWER_THIRD` | 1 | `LOWER_THIRD` |
| `HEADLINE` | 2 | `HEADLINE` |

No manual overlay routing is required beyond having those inputs in the preset. Sofie sends `OVERLAY_INPUT_IN` / `OVERLAY_INPUT_OUT` via TSR when parts activate/deactivate.

### Mix 3 configuration

1. In vMix, open **Settings → Outputs**.
2. Ensure **Mix 3** is enabled (virtual output or physical output).
3. Create input `MIX3_FEED` in the preset.
4. Optionally route Mix 3 to a multiview box so you can see the take without affecting Mix 1 (main program).

The blueprint creates TSR mappings:

- `vmix_mix3_program` → `MappingVmixType.Program`, `index: 3`
- `vmix_mix3_preview` → `MappingVmixType.Preview`, `index: 3`, `disableDefaults: true`

When the `MIX3_FEED` part is active, timeline layer `vmix_mix3_program` sends `ACTIVE_INPUT` targeting Mix 3.

### BG_LOOP playback

Assign a short looping video file to the `BG_LOOP` input in vMix. The `CLIP` rundown part sets `playing: true` and `loop: true` on the input mapping. When the part ends, the timeline clears and TSR stops/pauses playback.

---

## 2. Sofie studio configuration

### Select the Hello vMix preset

1. Upload blueprints (`yarn dist` in `packages/blueprints`).
2. In Sofie **Settings → Studios**, select blueprint `demo-main-studio`.
3. Choose config preset **Hello vMix Demonstration** (`helloVmix`).
4. Apply settings.

### `vmixInputs` registry

The preset configures:

```json
{
  "vmixInputs": {
    "CAMERA": { "input": "CAMERA" },
    "LOWER_THIRD": { "input": "LOWER_THIRD", "overlay": 1 },
    "HEADLINE": { "input": "HEADLINE", "overlay": 2 },
    "DOUBLEBOX": { "input": "DOUBLEBOX" },
    "BG_LOOP": { "input": "BG_LOOP", "loop": true },
    "MIX3_FEED": { "input": "MIX3_FEED", "mix": 3 }
  },
  "visionMixer": {
    "type": "Vmix",
    "host": "127.0.0.1",
    "port": 8099,
    "deviceId": "vmix0"
  }
}
```

Registry keys are arbitrary labels. The `input` field may be a **number** (vMix input index) or **string** (exact vMix input name).

---

## 3. Connect Playout Gateway

1. Start **Playout Gateway** connected to your Sofie Core.
2. Confirm a device **`vmix0`** appears (created automatically by the blueprint `applyConfig`).
3. Set host/port to match vMix (default `127.0.0.1:8099`).
4. Ensure device status is **Connected**.

Mappings are generated automatically, including:

| Layer ID | Mapping type | Notes |
|----------|--------------|-------|
| `vmix_me_program` | Program, index 1 | Main program bus |
| `vmix_me_preview` | Preview, index 1, `disableDefaults: true` | Lookahead preview |
| `vmix_overlay_lower_third` | Overlay, index 1 | |
| `vmix_overlay_headline` | Overlay, index 2 | |
| `vmix_input_bg_loop` | Input, `BG_LOOP`, `disableDefaults: true` | Playback control |
| `vmix_mix3_program` | Program, index 3 | Mix 3 demo |

### Why `disableDefaults: true` on Preview?

Without it, TSR emits default preview commands (often `PREVIEW_INPUT` with `input: 0`) when the rundown baseline reloads. That spams vMix and makes debugging harder. Explicit `TimelineContentVMix.PREVIEW` objects from parts drive lookahead instead.

---

## 4. Create the demonstration rundown

In **Rundown Editor**, create a segment with parts whose **type** field matches exactly:

```text
CAMERA
LOWER THIRD
DOUBLEBOX
CAMERA
CLIP
MIX3_FEED
```

Part **type** is case-insensitive (`camera` also works). Spaces in `LOWER THIRD` are normalised to `LOWER_THIRD`.

Ingest the rundown into Sofie, activate the playlist, and step through with **TAKE**.

---

## 5. Verify commands

### vMix activator log

In vMix: **Settings → Web Controller → Activator** (or enable TCP API logging). Watch for:

| Action | Expected API function |
|--------|----------------------|
| Camera take | `Function=Cut` or `Function=Active` with `Input=CAMERA` |
| Lower third on | `Function=OverlayInput1In` + `Input=LOWER_THIRD` |
| Lower third off | `Function=OverlayInput1Out` |
| Double box | `Function=Active` with `Input=DOUBLEBOX` |
| Clip play | `Function=Play` on `BG_LOOP` |
| Mix 3 take | Active input on Mix 3 to `MIX3_FEED` |

### Playout Gateway logs

Enable debug logging on Playout Gateway. Look for TSR state diffs referencing:

- `vmix0`
- Layer `vmix_me_program`, `vmix_overlay_lower_third`, `vmix_input_bg_loop`, `vmix_mix3_program`

Example log patterns:

```text
Device vmix0: Sending command ACTIVE_INPUT ...
Device vmix0: Sending command OVERLAY_INPUT_IN ...
Device vmix0: Sending command PLAY_INPUT ...
```

---

## 6. Validation matrix

| Test | Action | Expected vMix behaviour | Expected TSR layer |
|------|--------|-------------------------|-------------------|
| **TEST 1** | Activate `CAMERA` | Program shows `CAMERA` input | `vmix_me_program` → `ACTIVE_INPUT CAMERA` |
| **TEST 2** | Activate `LOWER THIRD` | Overlay 1 on with `LOWER_THIRD` | `vmix_overlay_lower_third` → `OVERLAY_INPUT_IN` |
| **TEST 3** | Deactivate `LOWER THIRD` (take next) | Overlay 1 off | `OVERLAY_INPUT_OUT` on overlay 1 |
| **TEST 4** | Activate `DOUBLEBOX` | Program shows `DOUBLEBOX` | `vmix_me_program` → `ACTIVE_INPUT DOUBLEBOX` |
| **TEST 5** | Activate `CLIP` | `BG_LOOP` plays, loops | `vmix_input_bg_loop` → `PLAY_INPUT`, `LOOP_ON` |
| **TEST 6** | Deactivate `CLIP` | `BG_LOOP` stops/pauses | Input layer clears |
| **TEST 7** | Activate `MIX3_FEED` | Mix 3 program shows `MIX3_FEED` | `vmix_mix3_program` → `ACTIVE_INPUT` on mix 3 |
| **TEST 8** | Activate `HEADLINE` | Overlay 2 on | `vmix_overlay_headline` → `OVERLAY_INPUT_IN` |

---

## 7. Troubleshooting checklist

| Symptom | Check |
|---------|-------|
| No vMix response | Playout Gateway `vmix0` connected? Host/port correct? Firewall allows TCP 8099? |
| Wrong input taken | Input names in vMix **exactly** match config (case-sensitive)? |
| Overlay does not appear | Overlay channel 1/2 free? Input exists? Part type spelled correctly? |
| `PREVIEW_INPUT input:0` spam | Confirm `disableDefaults: true` on preview mappings (Hello vMix preset does this). |
| Mix 3 no change | Mix 3 output enabled in vMix? View Mix 3 output or multiview, not only Mix 1. |
| CLIP does not play | `BG_LOOP` has media assigned? Input name matches? |
| Part shows invalid | Part type must be one of: `CAMERA`, `LOWER THIRD`, `HEADLINE`, `DOUBLEBOX`, `CLIP`, `MIX3_FEED`. |
| Blueprint config errors | Open Studio settings → check `vmixInputs` validation messages. |

---

## 8. Scope boundaries

The Hello vMix workflow intentionally does **not** include:

- Google Sheets / newsroom ingest automation
- Dynamic title text from rundown fields
- AddInput / asset loading pipelines
- CasparCG removal
- Audio level automation
- Production newsroom presets (Spravy Gabi/Miso)

Those are separate follow-up milestones after this integration proof.
