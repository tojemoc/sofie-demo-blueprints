import { BlueprintResultPart, IBlueprintPiece, PieceLifespan } from '@sofie-automation/blueprints-integration'
import { PartContext } from '../../../common/context.js'
import { HelloVmixAction, HelloVmixProps, PartProps } from '../definitions/index.js'
import {
	createHelloVmixInputPlaybackTimeline,
	createHelloVmixMixProgramTimeline,
	createHelloVmixOverlayTimeline,
	createHelloVmixProgramTimeline,
} from '../helpers/helloVmixTimeline.js'
import { parseConfig } from '../helpers/config.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'

function getSourceLayerForAction(action: HelloVmixAction): SourceLayer {
	switch (action) {
		case HelloVmixAction.Overlay:
			return SourceLayer.LowerThird
		case HelloVmixAction.InputPlayback:
			return SourceLayer.VT
		case HelloVmixAction.MixProgram:
			return SourceLayer.GFX
		case HelloVmixAction.Program:
		default:
			return SourceLayer.Camera
	}
}

export function generateHelloVmixPart(context: PartContext, part: PartProps<HelloVmixProps>): BlueprintResultPart {
	const config = parseConfig(context).studio
	const { registryKey, action } = part.payload

	let timelineObjects
	switch (action) {
		case HelloVmixAction.Overlay:
			timelineObjects = createHelloVmixOverlayTimeline(config, registryKey)
			break
		case HelloVmixAction.InputPlayback:
			timelineObjects = createHelloVmixInputPlaybackTimeline(config, registryKey)
			break
		case HelloVmixAction.MixProgram:
			timelineObjects = createHelloVmixMixProgramTimeline(config, registryKey)
			break
		case HelloVmixAction.Program:
		default:
			timelineObjects = createHelloVmixProgramTimeline(config, registryKey)
			break
	}

	const sourceLayer = getSourceLayerForAction(action)

	const piece: IBlueprintPiece = {
		enable: { start: 0 },
		externalId: part.payload.externalId,
		name: part.payload.name,
		lifespan: PieceLifespan.WithinPart,
		sourceLayerId: sourceLayer,
		outputLayerId: getOutputLayerForSourceLayer(sourceLayer),
		content: {
			timelineObjects,
		},
	}

	return {
		part: {
			externalId: part.payload.externalId,
			title: part.payload.name,
			expectedDuration: part.payload.duration,
		},
		pieces: [piece],
		adLibPieces: [],
		actions: [],
	}
}
