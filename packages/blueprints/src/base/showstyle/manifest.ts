import {
	BlueprintManifestType,
	ShowStyleBlueprintManifest,
	JSONBlobStringify,
	JSONSchema,
	IRundownActivationContext,
	IOnTakeContext,
	IOnSetAsNextContext,
	BlueprintPlayoutPersistentStore,
	IBlueprintPartInstance,
	IBlueprintPieceInstance,
} from '@sofie-automation/blueprints-integration'
import { executeAction, executeDataStoreAction } from './executeActions/index.js'
import { getAdlibItem } from './getAdlibItem.js'
import { getSegment } from './getSegment.js'
import { getShowStyleVariantId } from './getShowStyleVariantId.js'
import { parseConfig, ShowStyleConfig } from './helpers/config.js'
import { VisionMixerDevice } from '../studio/helpers/config.js'
import { createVmixRecordingPiece } from './helpers/studioCalibration.js'
import { SourceLayer } from './applyconfig/layers.js'
import { CasparCGLayers } from '../studio/layers.js'
import { isOutroVideoFile } from './helpers/clips.js'
import { getAbResolverConfiguration } from './getAbResolverConfiguration.js'
import { getRundown } from './rundown/index.js'
import { syncIngestUpdateToPartInstance } from './syncIngestUpdateToPartInstance.js'
import { validateConfig } from './validateConfig.js'
import { applyConfig } from './applyconfig/index.js'
import * as ConfigSchema from '../../$schemas/main-showstyle-config.json'
import { dereferenceSync } from 'dereference-json-schema'

export const baseManifest: Omit<ShowStyleBlueprintManifest<ShowStyleConfig>, 'blueprintId' | 'configPresets'> = {
	/** The type of this blueprint */
	blueprintType: BlueprintManifestType.SHOWSTYLE,

	/** Version of this blueprint */
	blueprintVersion: __VERSION__,
	/** Version of blueprints-integration that this blueprint depends on */
	integrationVersion: __VERSION_INTEGRATION__,
	/** Version of timeline-state-resolver-types that this blueprint depends on */
	TSRVersion: __VERSION_TSR__,

	/** A list of config items this blueprint expects to be available on the ShowStyle */
	showStyleConfigSchema: JSONBlobStringify<JSONSchema>(
		dereferenceSync(JSON.parse(JSON.stringify(ConfigSchema))) as any
	),

	/** Returns the id of the show style variant to use for a rundown, return null to ignore that rundown */
	getShowStyleVariantId,
	/** Generate rundown from ingest data. return null to ignore that rundown */
	getRundown,
	/** Generate segment from ingest data */
	getSegment,
	/** Push autoNext / expectedDuration onto current and next PartInstances after ingest */
	syncIngestUpdateToPartInstance,
	/** Generate adlib piece from ingest data */
	getAdlibItem,
	/** Execute an action defined by an IBlueprintActionManifest */
	executeAction,
	/**
	 * Execute an action defined by an IBlueprintActionManifest.
	 *
	 * This callback allows an action to perform operations only on the Timeline Datastore.
	 * This allows for a _fast-path_ for rapid-fire actions, before the full `executeAction` callback resolves.
	 */
	executeDataStoreAction,

	/** Called just before `onTimelineGenerate` to perform AB-playback for the timeline */
	getAbResolverConfiguration,
	// translations: __TRANSLATION_BUNDLES__,

	/**
	 * Validate the config passed to this blueprint.
	 * Do various sanity checks of the config and return a list of messages to display to the user.
	 */
	validateConfig,
	/**
	 * Apply the config by generating the data to be saved into the db.
	 * This should be written to give a predictable and stable result, it can be called with the same config multiple times.
	 */
	applyConfig,
	/** Called when a RundownPlaylist has been activated */
	onRundownActivate: async (_context: IRundownActivationContext) => {
		// Noop
	},
	/**
	 * Called during a Take — 'next' is the part being taken. On the first
	 * on-air Take of a vMix studio, insert the OutOnRundownEnd
	 * `RECORDING { on: true }` piece into the taken part so recording starts
	 * at the first Take, and flag the show as recording so `onSetAsNext` can
	 * keep arming subsequent parts. Rehearsal takes are ignored.
	 *
	 * The piece cannot rely on infinite continuation alone: on cores where
	 * `insertPiece` pieces are not flagged `dynamicallyInserted`,
	 * `getPlayheadTrackingInfinitesForPart` does not continue them into the
	 * next PartInstance, and Core never calls `onTake` for auto-next
	 * transitions — so the copy in the outgoing part would die at the part
	 * boundary (e.g. the auto-next out of the intro) with nothing to replace
	 * it. `onSetAsNext` covers those transitions by arming every nexted part.
	 */
	onTake: async (
		context: IOnTakeContext,
		playoutPersistentState: BlueprintPlayoutPersistentStore<unknown>
	): Promise<void> => {
		const config = parseConfig(context).studio
		if (config.visionMixer.type !== VisionMixerDevice.VMix || context.isRehearsal) return
		const recordingState = playoutPersistentState as BlueprintPlayoutPersistentStore<{
			vmixRecordingStarted?: boolean
		}>
		const nextPartInstance = await context.getPartInstance('next')
		await ensureVmixRecordingPiece(context, nextPartInstance)
		recordingState.setKey('vmixRecordingStarted', true)
	},
	/**
	 * Called whenever a PartInstance is set as Next — including by the
	 * auto-next path (`onPartPlaybackStarted` → `setNextPart`), which never
	 * calls `onTake`. Once the show has gone on air, arm the nexted part with
	 * the `RECORDING { on: true }` piece: it stays dormant while the part is
	 * next and enters the timeline exactly when that part is taken (manually
	 * or by auto-next), at the same instant the previous part's copy leaves —
	 * so the vMix recording stays continuous until the last copy dies at
	 * outro end / deactivate. Should Core ever continue the previous copy as
	 * an infinite, the source-layer presence check skips the re-insert.
	 *
	 * The flag alone cannot gate rehearsal: an active playlist can be
	 * flipped back to rehearsal without resetting persistent state, so part
	 * instances created while in rehearsal (`rehearsal: true`) are never
	 * armed.
	 */
	onSetAsNext: async (
		context: IOnSetAsNextContext,
		playoutPersistentState: BlueprintPlayoutPersistentStore<unknown>
	): Promise<void> => {
		const config = parseConfig(context).studio
		if (config.visionMixer.type !== VisionMixerDevice.VMix) return
		const recordingState = playoutPersistentState as BlueprintPlayoutPersistentStore<{
			vmixRecordingStarted?: boolean
		}>
		if (!recordingState.getKey('vmixRecordingStarted')) return
		const nextPartInstance = await context.getPartInstance('next')
		if (!nextPartInstance || nextPartInstance.rehearsal) return
		await ensureVmixRecordingPiece(context, nextPartInstance)
	},
	// Uncomment this to enable config fixup migrations between blueprint versions.
	// Note: When defined, fixUpConfig must be run after every blueprint upload before
	// config can be validated/applied.
	// fixUpConfig: () => {
	// 	// Noop
	// },
}

/**
 * Insert the vMix `RECORDING { on: true }` piece into 'next' unless it already
 * carries one (e.g. a Core-continued infinite). Shared by `onTake` (the part
 * being taken) and `onSetAsNext` (the part being armed while next).
 */
async function ensureVmixRecordingPiece(
	context: Pick<IOnSetAsNextContext, 'getPieceInstances' | 'insertPiece' | 'updatePieceInstance'>,
	nextPartInstance: IBlueprintPartInstance | undefined
): Promise<void> {
	const nextPieces = await context.getPieceInstances('next')
	const recordingInstance = nextPieces.find(
		(instance) => instance.piece.sourceLayerId === (SourceLayer.VmixRecording as string)
	)
	const durationMs = vmixRecordingDurationForPart(nextPartInstance, nextPieces)
	if (recordingInstance) {
		if (durationMs !== undefined) {
			await context.updatePieceInstance(recordingInstance._id, {
				enable: { start: 0, duration: durationMs },
			})
		}
		return
	}
	await context.insertPiece('next', createVmixRecordingPiece(durationMs))
}

/**
 * Finite recording duration for the timed outro part (PGM 210 `assets/outro`
 * overlay + `expectedDuration`), so vMix emits STOP_RECORDING when the jingle
 * ends instead of waiting for deactivation. Undefined on ordinary parts.
 */
function vmixRecordingDurationForPart(
	partInstance: IBlueprintPartInstance | undefined,
	pieceInstances: IBlueprintPieceInstance[]
): number | undefined {
	const expectedDuration = partInstance?.part?.expectedDuration
	if (!expectedDuration || expectedDuration <= 0) return undefined
	return pieceInstances.some((instance) =>
		(instance.piece.content?.timelineObjects ?? []).some((obj) => {
			const file = (obj.content as { file?: unknown }).file
			return (
				obj.layer === (CasparCGLayers.CasparCGPgmIntroPlayer as string) &&
				typeof file === 'string' &&
				isOutroVideoFile(file)
			)
		})
	)
		? expectedDuration
		: undefined
}
