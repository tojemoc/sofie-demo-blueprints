import { ShowStyleBlueprintManifest } from '@sofie-automation/blueprints-integration'

import { ShowStyleConfig } from '../../base/showstyle/helpers/config.js'
import { baseManifest } from '../../base/showstyle/manifest.js'
import { getShowStyleConfigPreset } from './configPresets.js'

const manifest: ShowStyleBlueprintManifest<ShowStyleConfig> = {
	...baseManifest,

	blueprintId: 'spravy360s',

	configPresets: getShowStyleConfigPreset(),
}

export default manifest
