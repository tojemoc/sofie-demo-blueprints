# Handoff prompt: implement the vMix program-switcher migration

Copy the block below, verbatim, to the agent that will implement it. It is self-contained;
the plan file `VMIX-PROGRAM-MIGRATION-PLAN.md` is the reference. Read the plan first.

---

You are implementing a blueprint change in the repo `tojemoc/sofie-demo-blueprints` (blueprints
package at `packages/blueprints`). Study `VMIX-PROGRAM-MIGRATION-PLAN.md` at the repo root before
writing code, then follow the steps below. Work on a NEW branch prefixed `posthog/` and open a
draft PR when done. Do not commit to `develop`.

## Task

Move the news-look program switch and its wipes out of Caspar and into vMix, which is already in
the rack as the production switcher. Caspar must end up rendering only pictures and clean
graphics. The in-Caspar wipe/STING/dual-route machinery has been causing on-air bugs that are not
reproducible in this repo (they live in Sofie-core lookahead and casparcg-state). The goal is to
delete that machinery, not to keep fixing it.

## Facts you can rely on (verify in code as you go)

- `StudioConfig.visionMixer.type` already supports `VisionMixerDevice.Vmix`; `vmixSources` is
  `Record<string, VmixInputConfig>` where `VmixInputConfig = { input: number; type: SourceType }`
  (`$schemas/generated/main-studio-config.ts`).
- `base/showstyle/helpers/visionMixer.ts` already has `createVMixTimelineObjects(input, start,
  transitionDuration, transitionProps?: TSR.VMixTransition)` returning PROGRAM + PREVIEW objects on
  `VMixLayers.VMixMeProgram` / `VMixMePreview`. Reuse and extend it for the take path.
- `base/studio/layers.ts` already has `VMixLayers` (Program / Preview / OverlayGraphics /
  DVEMultiView) and `AtemLayers`.
- Caspar channels (`casparcg.hypercomposed`): led 1, pgm 2, bgA 3, bgB 4, camIngest 5.
- The current take path lives in `base/showstyle/helpers/pgmLook.ts`: `createPgmRouteTimelineObjects`
  (110/111 dual routes), `createStingRouteTimelineObjects` (layer 124 STING),
  `createPgmWipeOverlayTimelineObject` (205-208 overlays), emitted by `createPgmRoutePiece`,
  `attachRouteToWipePiece`, `finalizeHypercomposedPart`.
- Look-media preload must still happen on Caspar (clips/ILU on the idle look channel must be
  LOADBG'd off-air before the vMix transition brings its input live).

## Target architecture (already agreed with the operator)

1. vMix inputs A and B = the two Caspar route feeds that alternate; the outgoing look is held
   under the wipe until the cut point.
2. vMix input C (or D) = Caspar clean-GFX output (L3D/countup/logo/headlines), keyed/placed over
   the vMix program.
3. The wipe = the operator's existing 1:1 vMix wipe, fired by Sofie each wiped take; hard cuts =
   vMix CUT.
4. Retire Caspar `route://5` cam-ingest; vMix owns the decklink camera.
5. Audio follows program in vMix; muting (wipe SFX / outro jingle) re-expressed for vMix +
   Sisyfos.

## Steps

1. Read the plan; read `visionMixer.ts`, `pgmLook.ts` (the take path), `finalizeHypercomposedPart`,
   the mappings in `applyConfig/mappings/casparcg.ts`, and the current tests
   (`__tests__/pgmLook.spec.ts`, `__tests__/casparcgMappings.spec.ts`,
   `__tests__/sting-contract.spec.ts`).
2. Config + mappings: vMix device (TSR `DeviceType.VMIX`) and layers; new
   `vmixSources` entries for route A, route B, clean GFX (the operator must confirm the vMix input
   numbers BEFORE you hard-code them — ask, do not guess).
3. Extend `visionMixer.ts` with a take-shaped builder: for a part, emit a vMix PROGRAM transition
   to the incoming input at the air cut, using `TSR.VMixTransition` — CUT for hard cuts, the 1:1
   wipe for wiped takes. Port the under-wipe hold (current `routeStartMs` / keepalive numbers)
   into the transition timing.
4. Rewire `finalizeHypercomposedPart` and the wipe/route piece paths: when
   `config.visionMixer.type === VisionMixerDevice.Vmx` (note: enum value is `'Vmix'`), emit the
   vMix program path and skip the Caspar dual-route/STING/overlay objects. Keep the Caspar path
   working behind a type branch so both are testable side-by-side during migration.
5. Port look preload: idle-look LOADBG + hot-PLAY timing (`applyL3dTakeOffsets`,
   `applyHardCutIdleLookHotCue`) into the new model.
6. Remove cam-ingest (`pgmCamera.ts` route://5 + `CasparCGPgmCameraIngest` mapping).
7. Audio: move ducking/wipe-SFX/outro mutes to vMix audio-follow-video + Sisyfos; confirm wipe SFX
   source.
8. Tests:
   - New contract test(s), over the smoke rundown: every part emits a vMix PROGRAM object with the
     correct incoming input and transition; A/B alternate; the clean-GFX output is present; no
     124 / 205-208 / cam-ingest objects remain.
   - Update the stale tests that assert the old Caspar route/STING/overlay behavior.
9. Validate: `yarn test` (blueprints, currently 242 tests — new suite must be green), `yarn
   check-types`, eslint on changed files. Blueprint-only verification is the ceiling in-repo; the
   operator validates on the rig.

## Constraints

- Follow the repo's conventions (read `AGENTS.md` / `CLAUDE.md` if present; match surrounding
  comment style and density; do not add narration comments).
- Do not change hard-cut look-compose behaviour on the Caspar side beyond what the vMix switch
  requires.
- Keep the diff minimal and reviewable; prefer removing dead code over leaving dormant paths,
  but keep the ATEM/Caspar branches alive until the operator confirms cutover.
- Never @-mention a person, and do not put private/operational detail in the PR.
- The on-air wipe look must remain the theme's 1:1 wipe (already in vMix); do not substitute a
  generic vMix transition without explicit operator approval.
- If a step needs an operator decision (input numbering, transition payload, audio source), ASK
  and stop — do not guess.

---
