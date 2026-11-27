import { BlueprintManifestType, SystemBlueprintManifest } from '@sofie-automation/blueprints-integration'

const manifest: SystemBlueprintManifest = {
	blueprintType: BlueprintManifestType.SYSTEM,

	blueprintId: 'spravy360s-system',
	blueprintVersion: __VERSION__,
	integrationVersion: __VERSION_INTEGRATION__,
	TSRVersion: __VERSION_TSR__,
	translations: __TRANSLATION_BUNDLES__,
}

export default manifest
