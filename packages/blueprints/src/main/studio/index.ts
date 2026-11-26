import { StudioBlueprintManifest } from '@sofie-automation/blueprints-integration'

import { StudioConfig } from '../../base/studio/helpers/config.js'
import { baseManifest } from '../../base/studio/manifest.js'
import { StudioConfigPresets } from './configs/index.js'

const manifest: StudioBlueprintManifest<StudioConfig> = {
	...baseManifest,

	blueprintId: 'studio360',

	configPresets: StudioConfigPresets,
}

export default manifest
