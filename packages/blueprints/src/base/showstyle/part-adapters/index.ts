import {
	BlueprintResultPart,
	BlueprintResultSegment,
	ISegmentUserContext,
	JSONBlobStringify,
	JSONSchema,
	SourceLayerType,
	UserEditingDefinitionAction,
	UserEditingType,
} from '@sofie-automation/blueprints-integration'
import { PartContext } from '../../../common/context.js'
import { SomeObject } from '../../../common/definitions/objects.js'
import { t } from '../../../common/util.js'
import {
	CameraProps,
	DVEProps,
	GfxProps,
	IntroProps,
	InvalidProps,
	LayeredVideoProps,
	PartProps,
	PartType,
	SegmentProps,
	TitlesProps,
	VOProps,
	VTProps,
} from '../definitions/index.js'
import { generateCameraPart } from './camera.js'
import { generateDVEPart } from './dve.js'
import { generateGfxPart } from './gfx.js'
import { generateIntroPart } from './intro.js'
import { generateLayeredVideoPart } from './layeredVideo.js'
import { generateRemotePart } from './remote.js'
import { generateOpenerPart as generateTitlesPart } from './titles.js'
import { generateVOPart } from './vo.js'
import { generateVTPart } from './vt.js'
import { BlueprintUserOperationTypes } from '../../studio/userEditOperations/types.js'
import {
	createSportBackgroundMusicPiece,
	duckAudioBedPieceDuringWipe,
	isSportSegmentName,
} from '../helpers/backgroundMusic.js'
import { parseConfig } from '../helpers/config.js'
import {
	CountupRevealClaim,
	appendCountupSustainIfRevealed,
	getCountupRevealClaimForGeneration,
	partShouldMuteCountup,
	partShouldPersistCountupMute,
} from '../helpers/countupReveal.js'
import {
	LookSlot,
	LookSlotSequence,
	findWipeVideoObject,
	getLookSlotSequenceForGeneration,
	raiseLookMediaPostrollForCrossSegmentWipe,
	raiseLookMediaPostrollForNextKeepalive,
} from '../helpers/pgmLook.js'
import { normalizeLayeredVideoFileName, resolveWipeDurationMs } from '../helpers/clips.js'
import { createLedBgLoopZoomPiece, segmentUsesLedBgLoopZoom } from '../helpers/ledBgLoopZoom.js'
import {
	createLedPodHeadlinePiece,
	createLedPodHeadlineClearPiece,
	segmentUsesLedPodHeadline,
} from '../helpers/ledPodHeadline.js'
import { SourceLayer } from '../applyconfig/layers.js'

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
	return lookSlots.claimIdle()
}

export function generateParts(
	context: ISegmentUserContext,
	intermediateSegment: SegmentProps,
	countupRevealClaim: CountupRevealClaim = getCountupRevealClaimForGeneration(context.rundownId),
	lookSlots: LookSlotSequence = getLookSlotSequenceForGeneration(context.rundownId)
): BlueprintResultSegment {
	context.logDebug('Generating parts for intermediateSegment: ' + JSON.stringify(intermediateSegment, null, 2))
	const studioConfig = parseConfig(context).studio
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

	const parts = intermediateSegment.parts.map((rawPart): BlueprintResultPart => {
		const partContext = new PartContext(context, rawPart.payload.externalId)
		// Editorial skip / float — never on-air; leave lookSlots unchanged for DB→DB peek.
		const ingestPayload = rawPart.payload as { float?: boolean; skip?: boolean }
		const floatedOrSkipped = Boolean(ingestPayload.float || ingestPayload.skip)
		// Peek BEFORE claim. Default peek is B — baseline PGM is `route://4`, so the
		// first look-bearing Take claims idle A and LOADBGs off-air before the route flips.
		// Until the first claim, previousLookSlot is undefined (baseline underlay only).
		const previousLookSlot = lookSlots.hasClaimed() ? lookSlots.peek() : undefined
		const lookSlot = resolveLookSlotForPart(rawPart.type, rawPart.objects, lookSlots, rawPart.rawType, floatedOrSkipped)
		let newPart: BlueprintResultPart

		switch (rawPart.type) {
			case PartType.Camera:
				newPart = generateCameraPart(
					partContext,
					rawPart as unknown as PartProps<CameraProps>,
					countupRevealClaim,
					lookSlot,
					previousLookSlot
				)
				break
			case PartType.Remote:
				newPart = generateRemotePart(
					partContext,
					rawPart as unknown as PartProps<CameraProps>,
					lookSlot,
					previousLookSlot
				)
				break
			case PartType.VT:
				newPart = generateVTPart(partContext, rawPart as unknown as PartProps<VTProps>, lookSlot, previousLookSlot)
				break
			case PartType.VO:
				newPart = generateVOPart(partContext, rawPart as unknown as PartProps<VOProps>, lookSlot, previousLookSlot)
				break
			case PartType.Titles:
				newPart = generateTitlesPart(partContext, rawPart as unknown as PartProps<TitlesProps>)
				break
			case PartType.Intro: {
				// Intro overlay on PGM (210); underlay claims idle so the next Take stays cross-slot.
				const introLook: LookSlot = floatedOrSkipped ? (previousLookSlot ?? lookSlots.peek()) : lookSlots.claimIdle()
				newPart = generateIntroPart(
					partContext,
					rawPart as unknown as PartProps<IntroProps>,
					introLook,
					previousLookSlot
				)
				break
			}
			case PartType.DVE:
				newPart = generateDVEPart(partContext, rawPart as unknown as PartProps<DVEProps>)
				break
			case PartType.GFX:
				newPart = generateGfxPart(partContext, rawPart as unknown as PartProps<GfxProps>, lookSlot, previousLookSlot)
				break
			case PartType.LayeredVideo:
				newPart = generateLayeredVideoPart(
					partContext,
					rawPart as unknown as PartProps<LayeredVideoProps>,
					lookSlot,
					previousLookSlot
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
		} else if (studioConfig.casparcg.hypercomposed && isLookBearingPartType(rawPart.type)) {
			// Baseline PLAYs pod_headline forever (prio 0). DoubleBox CLEAR is OutOnRundownEnd,
			// but Sofie timeline rebuilds between SJV/ŠPORT Takes briefly let baseline win —
			// operators saw pod_headline.png flash on the LED. Re-assert EMPTY on every
			// non-headline look part so layer 112 stays dark.
			newPart.pieces.push(createLedPodHeadlineClearPiece(rawPart.payload.externalId))
		}
		// Editorial skip / float from Rundown Editor — Sofie must not take these parts.
		if (floatedOrSkipped) {
			newPart.part.floated = true
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

	// Sofie holds previous look only for piece.postrollDuration into the next Take's
	// previousPartKeepaliveDuration. Raise each part to the following on-air wipe's
	// editorial cutPoint when that exceeds the per-part default sting floor (2500 ms).
	raiseLookMediaPostrollForNextKeepalive(parts)
	// Segment-local raise cannot see the next segment's opening wipe — hold the last
	// on-air part through a full sting so cross-segment wiped Takes keep picture.
	raiseLookMediaPostrollForCrossSegmentWipe(parts)

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
		// muteFrom 0: bed must be at intended level the moment wipe CLEAR (not latency-shifted).
		const wipe = findWipeVideoObject(entranceRaw?.objects ?? [])
		if (wipe) {
			const rawWipeFile =
				(typeof wipe.attributes?.fileName === 'string' && wipe.attributes.fileName.trim()) ||
				(typeof wipe.clipName === 'string' && wipe.clipName.trim()) ||
				''
			const wipeFile = rawWipeFile ? normalizeLayeredVideoFileName('wipe', rawWipeFile) : undefined
			duckAudioBedPieceDuringWipe(sportMusic, resolveWipeDurationMs(wipe.duration, wipeFile), 0)
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
