---
sidebar_position: 9
---

# vMix smoke test (Milestone 0)

This smoke test proves that a **stock Sofie Rundown Editor rundown** — using normal part types (`cam`, `gfx`, `dve`, `full`) and no custom manifests — drives vMix through the `vmixInputs` registry.

It complements the [Hello vMix](hello_vmix.md) demonstration, which uses dedicated part **types** (`CAMERA`, `LOWER THIRD`, …). The smoke test uses the same registry keys but routes through the standard newsroom part adapters.

## Prerequisites

1. Sofie Core with demo blueprints uploaded.
2. Studio preset **Hello vMix Demonstration** (`helloVmix`) applied — this enables the `vmixInputs` registry and `vmix0` device.
3. vMix preset with inputs named exactly: `CAMERA`, `LOWER_THIRD`, `DOUBLEBOX`, `BG_LOOP`.
4. Playout Gateway connected to `vmix0`.

## Configure Rundown Editor types

On current Rundown Editor releases, open **Settings** and confirm the default **Part Types** (`Cam`, `GFX`, `DVE`, `Full`, …) and **Segment Types** (`Normal`, `Opening`) are present. If a type list is empty, import [`sofie-rundown-editor-type-manifests.json`](https://github.com/tojemoc/sofie-demo-blueprints/blob/main/assets/sofie-rundown-editor-type-manifests.json) into each relevant settings page (Piece Types, Part Types, Segment Types). Import the matching `entityType` entries only — for example, import piece manifests on the Piece Types page, not the rundown JSON.

The legacy [`sofie-rundown-editor-piece-types.json`](https://github.com/tojemoc/sofie-demo-blueprints/blob/main/assets/sofie-rundown-editor-piece-types.json) is for older Rundown Editor builds only. It does not include `entityType` and is rejected by current type-import dialogs.

## Import the rundown

1. On the **Rundowns** tab (not Templates), click **Import** and select [`hello-vmix-smoke-rundown.json`](https://github.com/tojemoc/sofie-demo-blueprints/blob/main/assets/hello-vmix-smoke-rundown.json) from the blueprints repository `assets/` folder.
2. If Rundown Editor reports **Rundown already exists**, delete the previous empty import first (Rundown properties → Delete), then import again. A failed earlier import can leave a rundown shell with no parts.
3. Open the rundown — you should see one segment (**vMix smoke test**) with four parts: **Cam**, **GFX**, **DVE**, and **Full**.
4. Enable **Sync to Sofie** on the rundown and save.
5. Activate the playlist in Sofie and step through with **TAKE**.

Part type IDs in the JSON must match Rundown Editor manifests exactly: `Cam`, `GFX`, `DVE`, and `Full` (case-sensitive). The smoke test file stores these in each part's `payload.type` field (the same layout as the official `demo-rundown.json`). Lowercase values such as `cam` are rejected on import and produce an empty segment. When this guide uses lowercase terms like `cam`, `gfx`, `dve`, or `full` elsewhere, that is informal shorthand for the part family; the JSON `payload.type` value must always use the exact manifest casing (`Cam`, `GFX`, `DVE`, `Full`).

## Expected behaviour

| Part type | Registry key | vMix action |
|-----------|--------------|-------------|
| `cam` | `CAMERA` | Program + preview cut to `CAMERA` (ignores `camNo` when registry is present) |
| `gfx` + `l3d` piece | `LOWER_THIRD` | Overlay 1 **IN**; **OUT** when you take the next part |
| `dve` | `DOUBLEBOX` | Program cut to `DOUBLEBOX` (no MultiView overlay hack) |
| `full` | `BG_LOOP` | Input playback with loop on `BG_LOOP` |

CasparCG timeline objects are omitted when the `vmixInputs` registry is configured — only vMix commands are emitted.

## Milestone 2 overlay pieces on camera parts

The same registry routing applies to graphic **pieces** attached to `cam`, `vo`, or `dve` parts:

| Piece type | Registry key | Overlay channel |
|------------|--------------|-----------------|
| `l3d` | `LOWER_THIRD` | 1 |
| `head` | `HEADLINE` | 2 |
| `strap` | `STRAP` (if configured in `vmixInputs`) | per registry |

Add optional keys such as `STRAP` to `vmixInputs` with an `overlay` channel when you need additional keys.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Rundown empty in Rundown Editor after import | Part types must be `Cam`, `GFX`, `DVE`, `Full` in `payload.type` — not lowercase. Delete any existing `Hello vMix Smoke Test` rundown, download the latest JSON, and import from the **Rundowns** tab. Do not import the rundown JSON into Settings → Piece/Part/Segment Types. |
| Re-import says "Rundown already exists" | Delete the old rundown first. A prior failed import keeps the rundown id but no parts. |
| Settings type import says "Invalid file" | Use `sofie-rundown-editor-type-manifests.json` (with `entityType`) on current Rundown Editor — not the legacy piece-types-only file. |
| Rundown won't sync to Sofie | `isTemplate` must be `false` on the rundown. Template rundowns cannot sync. |
| `VT is missing a file path` on shelf ad-libs (Play: CAM 1, etc.) | You are on the **vMix Demo** hybrid preset, not Hello vMix. Those messages come from global shelf ad-libs, not the smoke test parts. Use preset **Hello vMix Demonstration** (`helloVmix`) for this test, or update blueprints so Play/Restart shelf ad-libs are not placed on the VT layer for cameras. |
| Cam still uses `camNo` mapping | Confirm `vmixInputs` is non-empty in studio settings |
| Gfx part does nothing | Gfx part must contain an `l3d` (or other mapped) piece |
| Full part does not play | Assign media to `BG_LOOP` in vMix; filename on the piece is not loaded automatically (see Milestone 4) |
| Overlay stays on | Take the next part — graphics use `enable: { while: 1 }` and clear on part end |

## Related documentation

- [Hello vMix integration](hello_vmix.md) — dedicated Hello part types and full validation matrix
- [Global configurations](global_configurations.md) — `vmixInputs` schema
