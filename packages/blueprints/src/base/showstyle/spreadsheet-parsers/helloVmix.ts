import { SpreadsheetIngestPart } from '../../../code-copy/spreadsheet-gateway/index.js'
import { HelloVmixAction, HelloVmixProps, PartInfo, PartProps, PartType } from '../definitions/index.js'
import { parseBaseProps } from './base.js'

interface HelloVmixRoute {
	registryKey: string
	action: HelloVmixAction
}

function normalizePartType(type: string | undefined): string {
	return (type ?? '').trim().toUpperCase().replace(/\s+/g, '_')
}

const HELLO_VMIX_ROUTES: Record<string, HelloVmixRoute> = {
	CAMERA: { registryKey: 'CAMERA', action: HelloVmixAction.Program },
	LOWER_THIRD: { registryKey: 'LOWER_THIRD', action: HelloVmixAction.Overlay },
	L3D: { registryKey: 'LOWER_THIRD', action: HelloVmixAction.Overlay },
	HEADLINE: { registryKey: 'HEADLINE', action: HelloVmixAction.Overlay },
	DOUBLEBOX: { registryKey: 'DOUBLEBOX', action: HelloVmixAction.Program },
	CLIP: { registryKey: 'BG_LOOP', action: HelloVmixAction.InputPlayback },
	BG_LOOP: { registryKey: 'BG_LOOP', action: HelloVmixAction.InputPlayback },
	MIX3_FEED: { registryKey: 'MIX3_FEED', action: HelloVmixAction.MixProgram },
	MIX3: { registryKey: 'MIX3_FEED', action: HelloVmixAction.MixProgram },
}

export function tryParseHelloVmix(ingestPart: SpreadsheetIngestPart): PartProps<HelloVmixProps> | undefined {
	const route = HELLO_VMIX_ROUTES[normalizePartType(ingestPart.type)]
	if (!route) return undefined

	return {
		type: PartType.HelloVmix,
		rawType: ingestPart.type,
		rawTitle: ingestPart.name,
		info: PartInfo.NORMAL,
		objects: [],
		payload: {
			...parseBaseProps(ingestPart),
			registryKey: route.registryKey,
			action: route.action,
		},
	}
}
