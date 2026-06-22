# vMix Granular Source Configuration

The demo blueprints include extended vMix support beyond the basic camera/remote adLibs.

> **Where does input selection happen?** See [Where vMix input selection is configured](./input-routing-guide.md) for rundown vs shelf vs macro routing, Rundown Editor fields, and Správy workflow gaps.

## Studio config preset

Use the **vMix Studio (granular sources + Companion macros)** preset in Studio Blueprint Config, or set `visionMixer.type` to `Vmix` manually.

The preset auto-provisions a vMix playout device (`vmix0` by default) with port **8088**.

## Configuring sources

Each entry in `vmixSources` generates multiple shelf adLibs:

| Generated adLib | When |
|-----------------|------|
| Cut | Always |
| Preview | Always |
| Overlay IN / OUT | Graphics type, or when `overlayChannel` is set |
| Play / Restart | Media player type, or `category: video` |

Sources are ordered on the shelf by `category` (video → technical → graphics) and grouped with `tags`.

## Overlay channels

vMix supports four overlay buses. Blueprint mappings exist for all four:

- `vmix_overlay_graphics` → Overlay 1
- `vmix_overlay_2` → Overlay 2
- `vmix_overlay_3` → Overlay 3
- `vmix_overlay_4` → Overlay 4

Set `overlayChannel` on a source to target a specific bus.

## Automation macros

Define multi-step sequences in `vmixAutomationMacros`. These map to Companion button action chains.

See the [Companion import tool](./companion-import-tool.md) for bulk migration from Companion backups.

## TSR mappings added per source

For each configured vMix source, blueprints also register:

- `vmix_audio_{input}` — per-input volume control
- `vmix_input_{input}` — playback / restart control

These enable audio and media adLibs without affecting unrelated inputs.

## DVE / MultiView

Keep one `multiview` source entry for DVE support (same as before). The multiview input number must match your vMix DVE input.
