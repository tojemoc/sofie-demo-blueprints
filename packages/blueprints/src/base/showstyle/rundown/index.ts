import {
	BlueprintResultRundown,
	ExtendedIngestRundown,
	IBlueprintRundown,
	IShowStyleUserContext,
	PlaylistTimingForwardTime,
	PlaylistTimingType,
} from '@sofie-automation/blueprints-integration'

import { SpreadsheetIngestRundown } from '../../../code-copy/spreadsheet-gateway/index.js'
import { literal } from '../../../common/util.js'
import { beginVmixBedGeneration, isSportSegmentName } from '../helpers/backgroundMusic.js'
import { beginCountupRevealGeneration } from '../helpers/countupReveal.js'
import { RundownMetadata } from '../helpers/metadata.js'
import { beginLookSlotGeneration } from '../helpers/pgmLook.js'
import { getBaseline } from './baseline.js'
import { getGlobalActions } from './globalActions.js'
import { getGlobalAdlibs } from './globalAdlibs.js'

export function getRundown(
	context: IShowStyleUserContext,
	ingestRundown: ExtendedIngestRundown
): BlueprintResultRundown {
	context.logDebug(
		'------------------------------- getRundown ----------------------------------------------------------------'
	)
	const bedSegments = ingestRundown.segments.map((segment) => ({
		externalId: segment.externalId,
		rank: segment.rank,
		name: segment.name,
		// Empty Šport segments promote C by name but emit no bed piece — the
		// restored snapshot must not leave them counting toward C ownership.
		producesC: isSportSegmentName(segment.name ?? '') && (segment.parts?.length ?? 0) > 0,
	}))
	beginCountupRevealGeneration(ingestRundown.externalId)
	beginLookSlotGeneration(ingestRundown.externalId)
	beginVmixBedGeneration(ingestRundown.externalId, bedSegments)
	const rundownMetadata: RundownMetadata = {
		ingestType: ingestRundown.type,
		// Persists on the rundown document — getSegment rehydrates it for
		// lone segment regenerations after a worker restart.
		vmixBedSegments: bedSegments,
	}

	const timing: PlaylistTimingForwardTime = {
		type: PlaylistTimingType.ForwardTime,
		expectedStart: 0,
		expectedDuration: 0,
	}
	const rundown = literal<IBlueprintRundown>({
		// playlistExternalId: 'test-playlist', // Uncomment to test simple playlist grouping. See 'packages/blueprints/src/base/studio/manifest.ts' for more advanced grouping

		externalId: ingestRundown.externalId,
		name: ingestRundown.name,
		privateData: rundownMetadata,
		timing,
	})
	context.logDebug('rundown' + JSON.stringify(rundown))

	const res: BlueprintResultRundown = {
		rundown,
		globalAdLibPieces: getGlobalAdlibs(context),
		globalActions: getGlobalActions(context, ingestRundown),
		baseline: getBaseline(context),
	}

	if (ingestRundown.payload) {
		const payload = ingestRundown.payload as SpreadsheetIngestRundown
		// Guard against missing or faulty payload:
		if ((payload.externalId, payload.name, payload.expectedStart, payload.expectedEnd)) {
			timing.expectedStart = payload.expectedStart
			timing.expectedDuration = payload.expectedEnd - payload.expectedStart
		}
	}

	context.logDebug('res' + JSON.stringify(res))

	return res
}
