# Plan: vMix as the program switcher (Caspar stops being a switcher)

Status: proposal. Author target: the implementing agent + operator sign-off.
Branch for implementation: fresh `posthog/` branch, own draft PR. Do not build this into the
current Caspar-side hot-fix PR.

## Goal

Route the news look program and its wipes through **vMix** instead of composing them inside
Caspar. vMix becomes the production switcher (already in the rack, licensed, fed by Caspar
outputs, with a 1:1 theme wipe already running and working). Caspar renders only pictures and
clean graphics. This removes the entire class of Caspar-side route/STING/wipe bugs (STING
dropped into a hard cut; late-starting wipes) that have been unreproducible in-repo because they
live in Sofie-core lookahead / casparcg-state interactions.

Success criteria:

- Every take produces a vMix program transition (CUT for hard cuts, the operator's 1:1 wipe for
  wiped takes), with no producer-arm mismatch anywhere.
- Caspar layer 124 (STING), the 205-208 wipe overlays, the 110/111 dual-route opacity flips and
  the `route://5` cam-ingest path are no longer used by the showstyle.
- The full blueprints test suite stays green (currently 242 tests) with the new vMix take path
  covered by the contract tests.
- On-air: wipes start on time, never drop, and the wipe look matches today's theme.

## Current architecture (what is being replaced)

All in `packages/blueprints/src`:

- `studio/helpers/config.ts` — `StudioConfig` carries `visionMixer.type` (`VisionMixerDevice.Atem |
  Vmix`), `atemSources` / `vmixSources` (each `{ input, type: SourceType }`), and
  `casparcg.hypercomposed` channels: `ledChannel: 1`, `pgmChannel: 2`, `bgChannelA: 3`,
  `bgChannelB: 4`, `camIngestChannel: 5` (`mappings/casparcg.ts` `getHypercomposedChannels`).
- `base/showstyle/helpers/pgmLook.ts` — the take path:
  - `createDualRouteTimelineObjects` — 110/111 always-live `route://3`/`route://4` producers,
    opacity/volume flip at `routeStartMs`.
  - `createStingRouteTimelineObjects` — layer 124 STING trial (`wipeUseStingRouteTransition`).
  - `createPgmWipeOverlayTimelineObject` / 205-208 wipe overlays.
  - `createPgmRoutePiece` / `attachRouteToWipePiece` / `finalizeHypercomposedPart` — emit the above.
  - `applyL3dTakeOffsets`, `delayHardCutLookMedia`, `applyHardCutIdleLookHotCue`, look
    preroll/postroll/keepalive — the in-Caspar timing model.
- `helpers/pgmCamera.ts` — look CAM as MEDIA `route://{camIngestChannel}` on
  `CasparCGPgmCameraIngest` (the operator wants this retired; vMix takes the decklink camera
  directly).
- `helpers/visionMixer.ts` — already has `createVMixTimelineObjects` (program + preview with a
  `TSR.VMixTransition`) and `createAtemInputTimelineObjects`.
- `base/studio/layers.ts` — `VMixLayers.VMixMeProgram / VMixMePreview / VMixOverlayGraphics /
  VMixDVEMultiView` already exist.
- `base/studio/applyConfig/mappings/casparcg.ts` — Caspar layer/device mappings.
- `base/showstyle/helpers/audio.ts`, `backgroundMusic.ts` — Caspar-mixer ducking and wipe SFX
  mutes (ride the route audio; must move to vMix audio-follow-video + Sisyfos).

## Target architecture (operator-confirmed)

- vMix inputs A and B = the two Caspar route feeds that alternate on hard cuts and hold the
  outgoing look **under** the wipe (the behaviour of the current 110/111 dual routes moves to the
  vMix program bus).
- vMix input C (or D) = Caspar **clean GFX** output — the HTML graphics (L3D templates, countup,
  logo, headlines) that Caspar currently composites, shipped as a clean layer vMix places/keys
  over the program.
- The wipe = the operator's existing 1:1 vMix wipe, triggered by Sofie as a per-take vMix
  transition.
- `route://5` cam-ingest retires; vMix owns the decklink camera input.
- Audio follows program in vMix; muting (wipe SFX, outro jingle) is re-expressed for vMix +
  Sisyfos.

## Changes

### 1. Config (`$schemas/main-studio-config.json`, generated types, test fixtures)

- Keep `VisionMixerDevice.VMix`; the studio config used by production switches to
  `visionMixer.type = 'Vmix'`.
- Extend `vmixSources` (currently `Record<string, VmixInputConfig>`) with the new roles:
  look route A feed, look route B feed, clean-GFX feed, (camera handled by vMix natively).
- Add whatever the vMix device needs for the program/preview + overlay (the fields TSR's VMIX
  device config already supports). Confirm the exact input numbers with the operator (vMix
  input numbering, not Caspar channel numbers).
- Drop/stop using `atemSources` for the showstyle once the ATEM path is not in use (keep the type
  for back-compat or remove cleanly — decide with operator).

### 2. Mappings (`applyConfig/mappings/` + device config)

- Caspar: keep clean outputs only. Route feeds on bgA/bgB; a clean GFX output; remove the
  cam-ingest mapping. The 124 STING / 205-208 wipe mappings become unused (remove or leave
  dormant — prefer removing for clarity).
- Add a `Vmix` device (TSR `DeviceType.VMIX`) with `VMixLayers` layers; wire program + preview +
  overlay.
- Confirm physical path with the operator: which Caspar outputs (decklink/NDI) feed which vMix
  inputs.

### 3. Take / wipe path (the bulk)

Replace the Caspar-side switch in `pgmLook.ts`:

- New build function (mirror `createVMixTimelineObjects` but take-shaped): for each taked part, a
  vMix PROGRAM object that transitions inputs (A→B / B→A) at the air cut with a
  `TSR.VMixTransition` — CUT for hard cuts, the 1:1 wipe transition for wiped takes.
- A/B alternation: keep the current slot ping-pong (`resolveLookSlotForPart`, `lookSlots`) to
  decide which route is incoming; emit the vMix transition to the incoming input and hold the
  outgoing until the transition cut point (port `routeStartMs` / keepalive semantics into the
  vMix transition timing).
- Remove/disable: `createDualRouteTimelineObjects`, `createStingRouteTimelineObjects`,
  `createPgmWipeOverlayTimelineObject`, the 205-208 wipe overlay + sticky baseline usage, the
  124 STING, and the mapping lookahead knobs added around them.
- Graphics: keep L3D/countup/logo rendering on Caspar (clean output to vMix). Re-point the GFX
  pieces so they target the clean-GFX feed; remove the in-Caspar "composite under wipe cover"
  logic that existed only because Caspar was the master.
- Look media preload (clips/ILU on the idle channel) still holds: the idle look must be LOADBG'd
  off-air before the vMix transition brings its input live — port `applyL3dTakeOffsets` /
  `applyHardCutIdleLookHotCue` to the new model (still Caspar-side, since the looks are Caspar).
- Expected packages: wipe files no longer needed on Caspar (vMix owns the wipe); keep mask/overlay
  only if Caspar's clean output still uses them.

### 4. Cam-ingest removal

- `pgmCamera.ts` `route://{camIngestChannel}` handling and `CasparCGPgmCameraIngest` mapping:
  remove. Camera look becomes a vMix native input (decklink). Keep the look-CAM *compose* on
  Caspar only if a look still needs the camera as a layer background.

### 5. Audio

- vMix follows program for the route feeds (audio-follow-video on the A/B inputs).
- Re-express `muteEditorialClipAudioDuringWipe`, `createWipeBackgroundMusicMutePiece`, outro
  ducking for the vMix model (or Sisyfos mutes that already exist).
- Confirm the wipe SFX: does the 1:1 vMix wipe carry its own SFX in vMix, or does it still need a
  Sisyfos/Caspar cue?

### 6. Tests

- Rewrite the Caspar-side assertions that now describe a dead path:
  `__tests__/pgmLook.spec.ts` (route/STING/overlay), `__tests__/casparcgMappings.spec.ts`
  (124 PRELOAD knobs), `__tests__/sting-contract.spec.ts` (2-124 + 110/111 contract).
- New contract tests: for the smoke rundown, assert every part emits a vMix PROGRAM object with
  the correct incoming input and transition (CUT for hard cuts, wipe otherwise), A/B alternate,
  and the clean-GFX output is present. Assert no 124/205-208/cam-ingest objects remain.

## Migration order

1. Config + mappings + fixtures (vMix device, input numbering) — operator confirms numbering.
2. `visionMixer.ts`: add the take-shaped vMix builder + transition contract.
3. Rewire `finalizeHypercomposedPart` to emit the vMix program path (A/B alternation + CUT/wipe),
   leave the old Caspar output code in place behind the `VisionMixerDevice` branch so it can be
   A/B'd.
4. Move timing (route start / hold / keepalive) into the vMix transition; port look-preload.
5. Remove cam-ingest; retire the dead Caspar wipe/STING code once the vMix path is validated.
6. Tests: contract tests for the vMix path; delete the obsolete ones.
7. Operator validation on the rig (see Risks).

## Risks & validation gates

- **vMix transition contract is the one real unknown in-repo.** The operator's 1:1 wipe exists;
  capture the exact `TSR.VMixTransition` payload it needs (transition type, duration, any
  transition-name/reverse props) before coding the take path. Test the CUT + wipe on the rig.
- **Under-wipe hold timing**: the outgoing look must stay up until the wipe's cut point. Port
  `routeStartMs`/keepalive exact numbers; verify frame-accurate on-air.
- **Graphics path**: clean-GFX keying over vMix program must be tested (placement, key/fill,
  whether it lags the program).
- **Audio**: vMix audio-follow-video + Sisyfos mutes must be verified; wipe SFX source confirmed.
- **Latency/build**: vMix adds a switch latency; confirm it doesn't push the cut point.
- This is a supervised build: the agent can only verify blueprint output via unit/contract tests;
  the operator must run the rig.

## Open items to confirm with the operator

- Exact vMix input numbers for the two route feeds and the clean-GFX feed.
- Exact vMix transition spec for the 1:1 wipe (type/duration/props) and for CUT.
- Whether Caspar clean GFX ships key+fill, or a single composited clean output.
- Wipe SFX source (vMix vs Sisyfos/Caspar).
- Whether the ATEM path/config should be removed or left dormant.
- Camera: which vMix input, and whether look-CAM on Caspar is still needed at all.
