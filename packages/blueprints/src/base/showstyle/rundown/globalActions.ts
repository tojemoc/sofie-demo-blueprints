import {
	ExtendedIngestRundown,
	IBlueprintActionManifest,
	IShowStyleUserContext,
} from '@sofie-automation/blueprints-integration'
import { literal, t } from '../../../common/util.js'
import { getOutputLayerForSourceLayer, SourceLayer } from '../applyconfig/layers.js'
import { ActionId } from '../executeActions/actionDefinitions.js'
import { exampleGraphicNextStepAdlibAction } from '../executeActions/steppedGraphicExample.js'
import { getVmixAutomationActionManifests } from '../executeActions/vmixAutomation.js'
import { parseConfig } from '../helpers/config.js'

export function getGlobalActions(
	context: IShowStyleUserContext,
	ingestRundown: ExtendedIngestRundown
): IBlueprintActionManifest[] {
	const config = parseConfig(context).studio

	return [
		literal<IBlueprintActionManifest>({
			actionId: ActionId.LastRemote,
			userData: {},
			userDataManifest: {},
			display: {
				label: t('Last Remote'),
				sourceLayerId: SourceLayer.Remote,
				outputLayerId: getOutputLayerForSourceLayer(SourceLayer.Remote),
			},
			externalId: ingestRundown.externalId,
		}),
		literal<IBlueprintActionManifest>({
			actionId: ActionId.LastDVE,
			userData: {},
			userDataManifest: {},
			display: {
				label: t('Last DVE'),
				sourceLayerId: SourceLayer.DVE,
				outputLayerId: getOutputLayerForSourceLayer(SourceLayer.DVE),
			},
			externalId: ingestRundown.externalId,
		}),
		exampleGraphicNextStepAdlibAction(ingestRundown),
		...getVmixAutomationActionManifests(config, ingestRundown.externalId),
	]
}
