import {
	BlueprintResultPart,
	BlueprintResultSegment,
	IBlueprintPiece,
	ISegmentUserContext,
	JSONBlobStringify,
	JSONSchema,
	PieceLifespan,
	SourceLayerType,
	TSR,
	UserEditingDefinitionAction,
	UserEditingType,
} from '@sofie-automation/blueprints-integration'

import { PartContext } from '../../../common/context.js'
import { SomeObject } from '../../../common/definitions/objects.js'
import { literal, t } from '../../../common/util.js'
import { TimelineBlueprintExt } from '../../studio/customTypes.js'
import { CasparCGLayers } from '../../studio/layers.js'
import { BlueprintUserOperationTypes } from '../../studio/userEditOperations/types.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import {
	CameraProps,
	DVEProps,
	GfxProps,
	IntroProps,
	InvalidProps,
	PartProps,
	PartType,
	SegmentProps,
	TitlesProps,
	VOProps,
	VTProps,
} from '../definitions/index.js'
import {
	createSportBackgroundMusicPiece,
	duckAudioBedPieceDuringWipe,
	getWipeSfxStartMs,
	isPocasieSegmentName,
	isSjvSegmentName,
	isSportSegmentName,
	isZaverSegmentName,
	markVmixSportBedEmitted,
	previousSegmentNameForGeneration,
	setVmixActiveBedForGeneration,
} from '../helpers/backgroundMusic.js'
import { normalizeLayeredVideoFileName, partHasOutroOverlay, resolveWipeDurationMs } from '../helpers/clips.js'
import { parseConfig } from '../helpers/config.js'
import {
	appendCountupSustainIfRevealed,
	CountupRevealClaim,
	getCountupRevealClaimForGeneration,
	partShouldMuteCountup,
	partShouldPersistCountupMute,
} from '../helpers/countupReveal.js'
import { createVmixDbLoopOpacityZeroObject, DOUBLEBOX_LOOP_FILE } from '../helpers/doubleboxLoop.js'
import {
	createLastHeadlineHoldPiece,
	HEADLINE_HOLD_CLIP_FRAME_MS,
	partHasHeadlineIlu,
	partHasIluZaverObject,
	partHasPocasieMedia,
} from '../helpers/graphics.js'
import { HEADLINE_SFX_FIRST_DELAY_MS, HEADLINE_SFX_NEXT_DELAY_MS } from '../helpers/headlineSfx.js'
import { createLedBgLoopZoomPiece, segmentUsesLedBgLoopZoom } from '../helpers/ledBgLoopZoom.js'
import {
	createLedPodHeadlineClearPiece,
	createLedPodHeadlinePiece,
	segmentUsesLedPodHeadline,
} from '../helpers/ledPodHeadline.js'
import {
	createIdleLookPreviewPiece,
	createLookAudioResetPiece,
	delayLedBgLoopZoomToWipeCut,
	findWipeVideoObject,
	getLookLayers,
	getLookSlotSequenceForGeneration,
	isDoubleBoxLook,
	isPgmRouteLayer,
	LOOK_HARD_CUT_KEEPALIVE_MS,
	LookSlot,
	LookSlotSequence,
	raiseLookMediaPostrollForCrossSegmentWipe,
	raiseLookMediaPostrollForNextKeepalive,
} from '../helpers/pgmLook.js'
import { createStudioCalibrationClearPiece } from '../helpers/studioCalibration.js'
import { usesVmixProgram, vmixProgramCutMs } from '../helpers/visionMixer.js'
import { generateCameraPart } from './camera.js'
import { generateDVEPart } from './dve.js'
import { generateGfxPart } from './gfx.js'
import { generateIntroPart } from './intro.js'
import { generateLayeredVideoPart } from './layeredVideo.js'
import { generateRemotePart } from './remote.js'
import { generateOpenerPart as generateTitlesPart } from './titles.js'
import { generateVOPart } from './vo.js'
import { generateVTPart } from './vt.js'

/** Part types that compose a story look on BG A/B. */
function isLookBearingPartType(type: PartType | null): boolean {
	switch (type) {
		case PartType.Camera:
		case PartType.VT:
		case PartType.VO:
		case PartType.GFX:
		case PartType.LayeredVideo:
			return true
		default:
			// Remote / Titles / Intro / DVE / Invalid / null — do not claim a look.
			return false
	}
}

/**
 * Physical look channel for this Take: claim the **idle** opposite of peek so
 * compose MEDIA always LOADBGs off-air before PGM `route://` flips. Editorial
 * DoubleBox vs Full is {@link lookKindForPart} (FILL / db_loop) — not A/B lock.
 *
 * Floated / skipped parts must not update look-slot history — they never go on-air.
 */
export function resolveLookSlotForPart(
	type: PartType | null,
	_objects: SomeObject[],
	lookSlots: LookSlotSequence,
	_rawType?: string,
	floatedOrSkipped = false
): LookSlot {
	if (!isLookBearingPartType(type) || floatedOrSkipped) {
		return lookSlots.peek()
	}
	// Outro.mov (PGM 210) brings no look of its own. Claiming the idle channel would flip the
	// route to a channel that still holds an older look (Počasie) and flash it under the jingle.
	if (partHasOutroOverlay(_objects)) {
		return lookSlots.peek()
	}
	return lookSlots.claimIdle()
}

/**
 * Generate this segment's parts: per-type adapters, look-slot bookkeeping for
 * the A/B ping-pong, then segment-level passes (idle-look preview injection,
 * postroll raises, sport entrance pick) that need every part's pieces settled.
 */
export function generateParts(
	context: ISegmentUserContext,
	intermediateSegment: SegmentProps,
	countupRevealClaim: CountupRevealClaim = getCountupRevealClaimForGeneration(context.rundownId),
	lookSlots: LookSlotSequence = getLookSlotSequenceForGeneration(context.rundownId)
): BlueprintResultSegment {
	context.logDebug('Generating parts for intermediateSegment: ' + JSON.stringify(intermediateSegment, null, 2))
	const studioConfig = parseConfig(context).studio
	// Wipe mute pieces ask which bed the segment owns (C from Šport onward).
	setVmixActiveBedForGeneration(
		context.rundownId,
		intermediateSegment.payload.externalId,
		intermediateSegment.payload.name ?? '',
		intermediateSegment.payload.rank
	)
	// Segment regeneration replaces its earlier countup copies — the claim must
	// re-emit the mute/sustain instead of suppressing against the stale mark.
	countupRevealClaim.beginSegment(intermediateSegment.payload.externalId ?? intermediateSegment.payload.name ?? '')
	// Create Segment UserEditOperations:
	const userEditOperationsOnSegment: UserEditingDefinitionAction[] = [
		{
			type: UserEditingType.ACTION,
			id: BlueprintUserOperationTypes.LOCK_SEGMENT_NRCS_UPDATES,
			label: t('Lock Segment for NRCS Updates'),
			// TODO: This could be a file on disk instead of data URL
			icon: `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPgogIDxyZWN0IHg9IjMiIHk9IjciIHdpZHRoPSIxMCIgaGVpZ2h0PSI3IiByeD0iMSIgcnk9IjEiIC8+CiAgPHBhdGggZD0iTTUgN1Y1YTMgMyAwIDAgMSA2IDB2MiIgLz4KPC9zdmc+`,
			isActive: intermediateSegment.userEditStates?.[BlueprintUserOperationTypes.LOCK_SEGMENT_NRCS_UPDATES],
		},
	]

	// SJV / ŠPORT SYNs are muted ILU beds under a live moderator read — the mic never ducks there.
	const synMicStaysLive =
		isSjvSegmentName(intermediateSegment.payload.name ?? '') ||
		isSportSegmentName(intermediateSegment.payload.name ?? '')
	// First headline SFX of the segment lands later (+400) than the rest (+300).
	let headlineSfxEmitted = false
	const partLookSlots: Array<LookSlot | undefined> = []
	// Objects of the previous on-air look-bearing part — ZAVER's leave-weather
	// teardown must know whether a wiped Take actually leaves Počasie, not just
	// that the incoming part carries ilu-zaver (ZAVER Cam/SYN interleaves).
	// For the segment's first look-bearing part the answer comes from segment
	// history: was the immediately preceding segment the Počasie segment.
	const previousSegmentName = previousSegmentNameForGeneration(
		context.rundownId,
		intermediateSegment.payload.externalId,
		intermediateSegment.payload.name ?? '',
		intermediateSegment.payload.rank
	)
	const segmentStartedAfterWeather = previousSegmentName !== undefined && isPocasieSegmentName(previousSegmentName)
	// The ilu-zaver avízo is OutOnRundownEnd — once any on-air part played it,
	// later záver parts must not re-delay it under a wipe (EMPTY gap on the
	// wall). Seeded from a preceding záver segment since the piece continues.
	// shortcut: never cleared, so an LED headline clip between záver parts
	// would keep it "on air" — editorial nonsense in this show; worst case the
	// avízo re-PLAYs at Take instead of the air cut.
	let ledAvizoOnAir = previousSegmentName !== undefined && isZaverSegmentName(previousSegmentName)
	let previousOnAirObjects: SomeObject[] | undefined
	const parts = intermediateSegment.parts.map((rawPart): BlueprintResultPart => {
		const partContext = new PartContext(context, rawPart.payload.externalId)
		// Editorial skip / float — never on-air; leave lookSlots unchanged for DB→DB peek.
		const ingestPayload = rawPart.payload as { float?: boolean; skip?: boolean }
		const floatedOrSkipped = Boolean(ingestPayload.float || ingestPayload.skip)
		// Peek BEFORE claim. Default peek is B — baseline PGM is `route://4`, so the
		// first look-bearing Take claims idle A and LOADBGs off-air before the route flips.
		// Until the first claim, previousLookSlot is undefined (baseline underlay only).
		const previousLookSlot = lookSlots.hasClaimed() ? lookSlots.peek() : undefined
		const previousPartHadWeather =
			previousOnAirObjects === undefined ? segmentStartedAfterWeather : partHasPocasieMedia(previousOnAirObjects)
		const iluZaverAlreadyOnAir = ledAvizoOnAir
		const lookSlot = resolveLookSlotForPart(
			rawPart.type,
			rawPart.objects,
			lookSlots,
			rawPart.rawType,
			floatedOrSkipped
		)
		partLookSlots.push(lookSlot)
		const hasHeadlineSfx =
			!floatedOrSkipped &&
			(rawPart.type === PartType.Camera || rawPart.type === PartType.GFX) &&
			partHasHeadlineIlu(rawPart.objects ?? [])
		const headlineSfxDelayMs = hasHeadlineSfx
			? headlineSfxEmitted
				? HEADLINE_SFX_NEXT_DELAY_MS
				: HEADLINE_SFX_FIRST_DELAY_MS
			: undefined
		if (hasHeadlineSfx) headlineSfxEmitted = true
		let newPart: BlueprintResultPart

		switch (rawPart.type) {
			case PartType.Camera:
				newPart = generateCameraPart(
					partContext,
					rawPart as unknown as PartProps<CameraProps>,
					countupRevealClaim,
					lookSlot,
					previousLookSlot,
					previousPartHadWeather,
					iluZaverAlreadyOnAir,
					headlineSfxDelayMs
				)
				break
			case PartType.Remote:
				newPart = generateRemotePart(
					partContext,
					rawPart as unknown as PartProps<CameraProps>,
					lookSlot,
					previousLookSlot,
					previousPartHadWeather,
					iluZaverAlreadyOnAir
				)
				break
			case PartType.VT:
				newPart = generateVTPart(
					partContext,
					rawPart as unknown as PartProps<VTProps>,
					lookSlot,
					previousLookSlot,
					previousPartHadWeather,
					iluZaverAlreadyOnAir
				)
				break
			case PartType.VO:
				newPart = generateVOPart(
					partContext,
					rawPart as unknown as PartProps<VOProps>,
					lookSlot,
					previousLookSlot,
					previousPartHadWeather,
					iluZaverAlreadyOnAir,
					synMicStaysLive
				)
				break
			case PartType.Titles:
				newPart = generateTitlesPart(partContext, rawPart as unknown as PartProps<TitlesProps>)
				break
			case PartType.Intro: {
				// Intro overlay on PGM (210); underlay claims idle so the next Take stays cross-slot.
				const introLook: LookSlot = floatedOrSkipped
					? (previousLookSlot ?? lookSlots.peek())
					: lookSlots.claimIdle()
				// resolveLookSlotForPart only peeked for Intro — record the slot it
				// actually claimed so the idle-preview same-slot guard sees it.
				partLookSlots[partLookSlots.length - 1] = introLook
				newPart = generateIntroPart(
					partContext,
					rawPart as unknown as PartProps<IntroProps>,
					introLook,
					previousLookSlot,
					previousPartHadWeather,
					iluZaverAlreadyOnAir
				)
				break
			}
			case PartType.DVE:
				newPart = generateDVEPart(partContext, rawPart as unknown as PartProps<DVEProps>)
				break
			case PartType.GFX:
				newPart = generateGfxPart(
					partContext,
					rawPart as unknown as PartProps<GfxProps>,
					lookSlot,
					previousLookSlot,
					previousPartHadWeather,
					iluZaverAlreadyOnAir,
					headlineSfxDelayMs
				)
				break
			case PartType.LayeredVideo:
				newPart = generateLayeredVideoPart(
					partContext,
					rawPart,
					lookSlot,
					previousLookSlot,
					previousPartHadWeather,
					iluZaverAlreadyOnAir
				)
				break
			case PartType.Invalid:
				newPart = {
					part: {
						externalId: rawPart.payload.externalId,
						title: rawPart.payload.name,
						invalid: true,
						invalidReason: {
							message: (rawPart.payload as InvalidProps).invalidReason,
						},
					},
					pieces: [],
					adLibPieces: [],
					actions: [],
				}
				break
			default:
				newPart = {
					part: {
						externalId: rawPart.payload.externalId,
						title: rawPart.payload.name,
						invalid: true,
						invalidReason: {
							message: t(`Parts generation for ${rawPart.type} not implemented`),
						},
					},
					pieces: [],
					adLibPieces: [],
					actions: [],
				}
		}
		if ((isLookBearingPartType(rawPart.type) || rawPart.type === PartType.Intro) && !floatedOrSkipped) {
			previousOnAirObjects = rawPart.objects
		}
		if (!floatedOrSkipped && partHasIluZaverObject(rawPart.objects)) {
			ledAvizoOnAir = true
		}
		appendCountupSustainIfRevealed(
			partContext,
			studioConfig,
			rawPart.payload.externalId,
			newPart.pieces,
			countupRevealClaim,
			{
				mute: partShouldMuteCountup(rawPart.rawType, rawPart.objects),
				persistMute: partShouldPersistCountupMute(rawPart.rawType, rawPart.objects),
			}
		)
		if (
			studioConfig.casparcg.hypercomposed &&
			isLookBearingPartType(rawPart.type) &&
			segmentUsesLedBgLoopZoom({
				name: intermediateSegment.payload.name,
				externalId: intermediateSegment.payload.externalId,
			})
		) {
			newPart.pieces.push(createLedBgLoopZoomPiece(studioConfig, rawPart.payload.externalId))
		}
		if (
			studioConfig.casparcg.hypercomposed &&
			segmentUsesLedPodHeadline({
				name: intermediateSegment.payload.name,
				externalId: intermediateSegment.payload.externalId,
			})
		) {
			newPart.pieces.push(createLedPodHeadlinePiece(partContext, studioConfig, rawPart.payload.externalId))
		} else if (
			studioConfig.casparcg.hypercomposed &&
			(isLookBearingPartType(rawPart.type) || rawPart.type === PartType.Intro)
		) {
			// Baseline PLAYs pod_headline forever (prio 0). DoubleBox CLEAR is OutOnRundownEnd,
			// but Sofie timeline rebuilds between SJV/ŠPORT Takes briefly let baseline win —
			// operators saw pod_headline.png flash on the LED. Re-assert EMPTY on every
			// non-headline look part so layer 112 stays dark. Intro hides the pod the
			// moment the znelka starts playing (pod lives only through the headlines).
			newPart.pieces.push(createLedPodHeadlineClearPiece(rawPart.payload.externalId))
		}
		if (studioConfig.casparcg.hypercomposed) {
			// Baseline carries the studio calibration look (LED testframe + look-B
			// db_loop/cam). Any part can be the first Take, so every part EMPTYs the
			// spare calibration layers — OutOnRundownEnd keeps them dead to show end.
			newPart.pieces.push(createStudioCalibrationClearPiece(rawPart.payload.externalId, studioConfig))
		}
		// Editorial skip / float from Rundown Editor — Sofie must not take these parts.
		if (floatedOrSkipped) {
			newPart.part.floated = true
		}
		// Resolved part type for runtime hooks — `onSetAsNext` reads it to arm the
		// dormant headline hold only when the actual next part is the intro.
		newPart.part.privateData = {
			...(newPart.part.privateData as Record<string, unknown> | undefined),
			partType: rawPart.type,
		}
		// Add userEditOperations to any part (include the segment ones?):
		newPart.part.userEditOperations = [...userEditOperationsOnSegment]

		newPart.part.userEditProperties = {
			pieceTypeProperties: {
				schema: {
					[PartType.Camera]: {
						// every type carries a label and a button type used for the button picker
						sourceLayerLabel: 'CAM',
						sourceLayerType: SourceLayerType.CAMERA,
						schema: JSONBlobStringify<JSONSchema>({
							$schema: 'https://json-schema.org/draft/2020-12/schema',
							type: 'object',
							properties: {
								valueOnVariant: {
									type: 'string',
									title: 'Change to Camera on part:',
									enum: ['1', '2', '3', '4', '5'],
									tsEnumNames: ['Cam 1', 'Cam 2', 'Cam 3', 'Cam 4', 'Cam 5'],
								} as any,
							},
							required: ['valueOnVariant'],
						}),
						defaultValue: {
							valueOnVariant: '2',
						},
					},
					[PartType.Remote]: {
						sourceLayerLabel: 'EXT',
						sourceLayerType: SourceLayerType.REMOTE,
						schema: JSONBlobStringify<JSONSchema>({
							$schema: 'https://json-schema.org/draft/2020-12/schema',
							type: 'object',
							properties: {
								valueOnVariant: {
									type: 'string',
									title: 'Change To External source on part:',
									enum: ['1', '2', '3', '4', '5'],
									tsEnumNames: ['Ext 1', 'Ext 2', 'Ext 3', 'Ext 4', 'Ext 5'],
								} as any,
							},
							required: ['valueOnVariant'],
						}),
						defaultValue: {
							// Here we need to get the camera number from the raw input:
							//@ts-expect-error - rawPart rawInput type depends on the type:
							valueOnVariant: String(rawPart.payload.input?.id || 2),
						},
					},
				},
				currentValue: {
					type: String(rawPart.type),
					value: {
						//@ts-expect-error - rawPart.payload.input types not specified:
						valueOnVariant: String(rawPart.payload.input?.id || 3),
					},
				},
			},
			// This is the global properties for the part - the lock is referencing the segment:
			globalProperties: {
				schema: JSONBlobStringify<JSONSchema>({
					$schema: 'https://json-schema.org/draft/2020-12/schema',
					title: 'Source schema for SPL Type',
					type: 'object',
					properties: {
						[BlueprintUserOperationTypes.LOCK_SEGMENT_NRCS_UPDATES]: {
							type: 'boolean',
							title: 'Lock Segment',
							'ui:displayType': 'switch',
						} as any, // note - get custom schema types here
					},
					required: [BlueprintUserOperationTypes.LOCK_SEGMENT_NRCS_UPDATES],
				}),
				currentValue: {
					[BlueprintUserOperationTypes.LOCK_SEGMENT_NRCS_UPDATES]:
						intermediateSegment.userEditStates?.[BlueprintUserOperationTypes.LOCK_SEGMENT_NRCS_UPDATES],
				},
			},
		}

		return newPart
	})

	if (studioConfig.casparcg.hypercomposed) {
		if (usesVmixProgram(studioConfig)) {
			// Phase-locked db_loop: every look-bearing part that does not own the
			// DoubleBox frame on its own slot re-asserts opacity 0, so a keepalive'd
			// opacity-1 reveal from a previous part/segment cannot linger (e.g. a
			// Full part after a DoubleBox would otherwise keep the frame on its
			// incoming slot). Parts with the frame keep it; the outgoing DoubleBox
			// slot stays revealed until its own off-air point.
			parts.forEach((generated, i) => {
				const slot = partLookSlots[i]
				if (
					slot === undefined ||
					generated.part.invalid ||
					generated.part.floated ||
					!isLookBearingPartType(intermediateSegment.parts[i]?.type ?? null)
				) {
					return
				}
				const ownsFrame = generated.pieces.some((piece) =>
					(piece.content.timelineObjects ?? []).some(
						(obj) =>
							String(obj.layer) === (getLookLayers(slot).doubleBoxLoop as string) &&
							(obj.content as { type?: string; file?: string }).file === DOUBLEBOX_LOOP_FILE &&
							(obj.content as { type?: string }).type === TSR.TimelineContentTypeCasparCg.MEDIA
					)
				)
				if (ownsFrame) {
					return
				}
				generated.pieces.push(
					literal<IBlueprintPiece>({
						enable: { start: 0 },
						externalId: `${generated.part.externalId}_db_loop_hold`,
						name: 'db_loop hold (vMix)',
						lifespan: PieceLifespan.WithinPart,
						sourceLayerId: SourceLayer.PgmDoubleBoxLoop,
						outputLayerId: getOutputLayerForSourceLayer(SourceLayer.PgmDoubleBoxLoop),
						content: {
							timelineObjects: [
								createVmixDbLoopOpacityZeroObject(getLookLayers(slot).doubleBoxLoop),
							] as TimelineBlueprintExt[],
						},
					})
				)
			})
		}
		// Dormant 'Idle look preview' placeholder on every playable part — armed at
		// runtime by `onSetAsNext` with the actual next part's look media, so the
		// paused-foreground preview follows re-nexts and crosses segment boundaries
		// that this segment-scoped generation can never see.
		for (let i = 0; i < parts.length; i++) {
			const generated = parts[i]
			if (generated.part.invalid || generated.part.floated) continue
			generated.pieces.push(createIdleLookPreviewPiece(generated.part.externalId))
			// On-air audio reset: a take/cancel inside the re-arm mute window (or a
			// rebuild that drops the armed unmute) leaves the input muted — the part
			// that takes it on air unmutes it at Take.
			const slot = partLookSlots[i]
			if (slot !== undefined) {
				generated.pieces.push(createLookAudioResetPiece(generated.part.externalId, slot))
			}
		}
	}

	// Every headline part carries a DORMANT `_headline_hold` piece — which part is
	// "last before intro" is only known at runtime (the intro may sit in the next
	// segment), so `onSetAsNext` arms it with a PAUSE object when the actual next
	// part is the intro. Until armed the empty piece is a no-op and the clip's
	// PUSH slide-out plays on removal.
	for (let i = 0; i < parts.length; i++) {
		const generated = parts[i]
		const rawPart = intermediateSegment.parts[i]
		if (generated.part.invalid || generated.part.floated) continue
		if (!partHasHeadlineIlu(rawPart.objects ?? [])) continue
		const iluEntry = generated.pieces
			.flatMap((piece) => (piece.content.timelineObjects ?? []).map((obj) => ({ piece, obj })))
			.find(
				({ obj }) =>
					String(obj.layer) === (CasparCGLayers.CasparCGIluPlayer as string) &&
					(obj.content as { type?: string; file?: string }).type === TSR.TimelineContentTypeCasparCg.MEDIA &&
					(obj.content as { file?: string }).file !== 'EMPTY' &&
					(obj.priority ?? 0) < 10 // scheduled only — ad-lib headline ILU media is +10
			)
		if (!iluEntry) continue // ad-lib-only headline: nothing on air to freeze
		// shortcut: +3.5 s assumes the mov's in-anim ends ~1.5 s into the clip;
		// there is no out-anim, so every later clip time is the static hold and
		// 3.5 s freezes a full-hold frame. Re-measure if headline files change.
		const clipStartMs =
			(typeof iluEntry.piece.enable?.start === 'number' ? iluEntry.piece.enable.start : 0) +
			(typeof iluEntry.obj.enable === 'object' &&
			!Array.isArray(iluEntry.obj.enable) &&
			typeof iluEntry.obj.enable.start === 'number'
				? iluEntry.obj.enable.start
				: 0)
		const durationMs = Number(rawPart.payload?.duration) || generated.part.expectedDuration || 0
		// Short part: freeze on the latest reachable frame (1f before part end)
		// rather than skipping the hold — the armed seek stays on the fixed
		// HEADLINE_HOLD_CLIP_FRAME_MS static frame regardless of this start.
		const freezeAtMs =
			durationMs > 0
				? Math.min(clipStartMs + HEADLINE_HOLD_CLIP_FRAME_MS, Math.max(0, durationMs - 20))
				: clipStartMs + HEADLINE_HOLD_CLIP_FRAME_MS
		generated.pieces.push(createLastHeadlineHoldPiece(rawPart.payload.externalId, freezeAtMs))
	}

	// `db_loop` is OutOnSegmentEnd so DB→DB chains keep the frame up — but it must
	// die with the part when the NEXT part isn't DoubleBox (e.g. AVIZO's shell
	// bleeding into the Outro, or a one-off DB into a Full look). Postroll still
	// carries it through the incoming transition's keepalive.
	for (let i = 0; i < parts.length; i++) {
		const dbLoopPieces = parts[i].pieces.filter(
			(piece) => piece.sourceLayerId === (SourceLayer.PgmDoubleBoxLoop as string)
		)
		if (!dbLoopPieces.length) continue
		let nextIsDoubleBox = false
		for (let j = i + 1; j < parts.length; j++) {
			const next = parts[j].part
			const nextRaw = intermediateSegment.parts[j]
			if (next.invalid || next.floated) continue
			nextIsDoubleBox = isDoubleBoxLook(nextRaw?.rawType, nextRaw?.objects ?? [])
			break
		}
		if (nextIsDoubleBox) continue
		for (const piece of dbLoopPieces) {
			piece.lifespan = PieceLifespan.WithinPart
		}
	}

	// Zoom pieces are attached after finalize — shift them to the route-flip
	// keyframe finalize already placed (wipe air cut / hard-cut keepalive end),
	// so the LED move lands with the picture cut, not the wipe start.
	const isVmixProgram = usesVmixProgram(studioConfig)
	for (const part of parts) {
		if (!part.pieces.some((piece) => piece.sourceLayerId === (SourceLayer.LedBgLoopZoom as string))) continue
		let routeFlipMs = 0
		if (isVmixProgram) {
			// vMix carries no route:// keyframes — the picture cut is the stinger
			// reaching its cut point (LEAD + stingerCutPointMs) or the hard Cut
			// at LOOK_HARD_CUT_KEEPALIVE_MS.
			const hasWipeTake = part.pieces.some((piece) => piece.sourceLayerId === (SourceLayer.PgmWipe as string))
			routeFlipMs = vmixProgramCutMs(studioConfig, hasWipeTake, LOOK_HARD_CUT_KEEPALIVE_MS)
		} else {
			for (const piece of part.pieces) {
				for (const obj of piece.content.timelineObjects ?? []) {
					if (!isPgmRouteLayer(String(obj.layer))) continue
					for (const kf of obj.keyframes ?? []) {
						const kfEnable = kf.enable as { start?: number } | undefined
						if (
							!Array.isArray(kf.enable) &&
							typeof kfEnable?.start === 'number' &&
							(kf.content as { mixer?: unknown } | undefined)?.mixer !== undefined
						) {
							routeFlipMs = Math.max(routeFlipMs, kfEnable.start)
						}
					}
				}
			}
		}
		delayLedBgLoopZoomToWipeCut(part.pieces, routeFlipMs)
	}

	// Sofie holds previous look only for piece.postrollDuration into the next Take's
	// previousPartKeepaliveDuration. Raise each part to the following on-air wipe's
	// editorial cutPoint when that exceeds the per-part default sting floor (2500 ms).
	raiseLookMediaPostrollForNextKeepalive(parts, studioConfig)
	// Segment-local raise cannot see the next segment's opening wipe — hold the last
	// on-air part through a full sting so cross-segment wiped Takes keep picture.
	raiseLookMediaPostrollForCrossSegmentWipe(parts)

	if (isSportSegmentName(intermediateSegment.payload.name)) {
		// C ownership sticks only for segments that emit the piece — an empty
		// Šport segment leaves the live bed alone for ZÁVER's restart/unmute.
		markVmixSportBedEmitted(
			context.rundownId,
			intermediateSegment.payload.externalId,
			intermediateSegment.payload.name ?? '',
			parts.length > 0
		)
	}
	if (isSportSegmentName(intermediateSegment.payload.name) && parts.length > 0) {
		// Prefer the wipe-entrance Take (first VO / wipe host), not a skipped open GFX shell.
		const sportEntranceIdx = Math.max(
			0,
			parts.findIndex((part) =>
				part.pieces.some(
					(piece) =>
						piece.sourceLayerId === (SourceLayer.VO as string) ||
						piece.sourceLayerId === (SourceLayer.PgmWipe as string) ||
						piece.name === 'BG music mute (Wipe)'
				)
			)
		)
		const entrancePart = parts[sportEntranceIdx] ?? parts[0]
		const entranceRaw = intermediateSegment.parts[sportEntranceIdx] ?? intermediateSegment.parts[0]
		const sportMusic = createSportBackgroundMusicPiece(
			context,
			studioConfig,
			entranceRaw?.payload.externalId ?? 'sport'
		)
		// Sport C is appended after finalize — duck it for wipe_sport on the entrance Take.
		// Duck from the SFX start (not Take — keeps the bed under the wipe's silent head),
		// restore at sting end so the bed is back when the wipe CLEARs.
		const wipe = findWipeVideoObject(entranceRaw?.objects ?? [])
		if (wipe) {
			const rawWipeFile =
				(typeof wipe.attributes?.fileName === 'string' && wipe.attributes.fileName.trim()) ||
				(typeof wipe.clipName === 'string' && wipe.clipName.trim()) ||
				''
			const wipeFile = rawWipeFile ? normalizeLayeredVideoFileName('wipe', rawWipeFile) : undefined
			duckAudioBedPieceDuringWipe(
				sportMusic,
				resolveWipeDurationMs(wipe.duration, wipeFile),
				getWipeSfxStartMs(studioConfig, wipeFile)
			)
		}
		entrancePart.pieces.push(sportMusic)
	}

	return {
		segment: {
			name: intermediateSegment.payload.name,
			userEditOperations: userEditOperationsOnSegment,
			userEditProperties: {
				// This is the global properties for the segment - the lock is referencing this segment:
				globalProperties: {
					schema: JSONBlobStringify<JSONSchema>({
						$schema: 'https://json-schema.org/draft/2020-12/schema',
						title: 'Source schema for SPL Type',
						type: 'object',
						properties: {
							[BlueprintUserOperationTypes.LOCK_SEGMENT_NRCS_UPDATES]: {
								type: 'boolean',
								title: 'Lock Segment',
								'ui:displayType': 'switch',
							} as any, // note - get custom schema types here
						},
						required: [BlueprintUserOperationTypes.LOCK_SEGMENT_NRCS_UPDATES],
					}),
					currentValue: {
						[BlueprintUserOperationTypes.LOCK_SEGMENT_NRCS_UPDATES]:
							intermediateSegment.userEditStates?.[BlueprintUserOperationTypes.LOCK_SEGMENT_NRCS_UPDATES],
					},
				},
			},
		},
		parts: parts,
	}
}
