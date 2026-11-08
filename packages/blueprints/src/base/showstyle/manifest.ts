import {
	BlueprintManifestType,
	ShowStyleBlueprintManifest,
	JSONBlobStringify,
	JSONSchema,
	IRundownActivationContext,
	IOnTakeContext,
} from '@sofie-automation/blueprints-integration'
import { executeAction, executeDataStoreAction } from './executeActions/index.js'
import { getAdlibItem } from './getAdlibItem.js'
import { getSegment } from './getSegment.js'
import { getShowStyleVariantId } from './getShowStyleVariantId.js'
import { parseConfig, ShowStyleConfig } from './helpers/config.js'
import { VisionMixerDevice } from '../studio/helpers/config.js'
import { createVmixRecordingPiece } from './helpers/studioCalibration.js'
import { SourceLayer } from './applyconfig/layers.js'
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
	 * Called during a Take — 'next' is the part being taken. On every on-air
	 * Take of a vMix studio, ensure the taken part carries the OutOnRundownEnd
	 * `RECORDING { on: true }` piece so recording starts at the first Take and
	 * stops at rundown end. Rehearsal takes are ignored.
	 *
	 * The piece is re-inserted per Take rather than relying on infinite
	 * continuation: `insertPiece` during `onTake` lands before Core marks the
	 * part taken, so the PieceInstance is never flagged `dynamicallyInserted`
	 * and `getPlayheadTrackingInfinitesForPart` does not continue it into the
	 * next PartInstance — it would die at the very next Take. The new object
	 * enters the timeline at the same instant the previous one leaves, so the
	 * vMix recording stays continuous. Should Core ever continue it as an
	 * infinite, the source-layer presence check skips the re-insert.
	 */
	onTake: async (context: IOnTakeContext): Promise<void> => {
		const config = parseConfig(context).studio
		if (config.visionMixer.type !== VisionMixerDevice.VMix || context.isRehearsal) return
		const nextPieces = await context.getPieceInstances('next')
		if (nextPieces.some((instance) => instance.piece.sourceLayerId === (SourceLayer.VmixRecording as string))) return
		await context.insertPiece('next', createVmixRecordingPiece())
	},
	// Uncomment this to enable config fixup migrations between blueprint versions.
	// Note: When defined, fixUpConfig must be run after every blueprint upload before
	// config can be validated/applied.
	// fixUpConfig: () => {
	// 	// Noop
	// },
}
