import {
	BlueprintPlayoutPersistentStore,
	BlueprintSyncIngestNewData,
	BlueprintSyncIngestPartInstance,
	IBlueprintMutatablePart,
	ISyncIngestUpdateToPartInstanceContext,
} from '@sofie-automation/blueprints-integration'

/**
 * Without this hook Core leaves current/next PartInstances on the last generated
 * `autoNext` / `expectedDuration` (job-worker `syncChangesToPartInstance.ts`:
 * if the blueprint omits the hook, ingest updates are not applied to instances).
 *
 * Copy the already-generated Part fields — do not re-derive AUTO here.
 */
export function syncIngestUpdateToPartInstance(
	context: ISyncIngestUpdateToPartInstanceContext,
	_existingPartInstance: BlueprintSyncIngestPartInstance,
	newData: BlueprintSyncIngestNewData,
	_playoutStatus: 'previous' | 'current' | 'next',
	_playoutPersistentState: BlueprintPlayoutPersistentStore<unknown>
): void {
	if (!newData.part) return

	const props: Partial<IBlueprintMutatablePart> = {
		autoNext: Boolean(newData.part.autoNext),
		// Core keeps the old duration when undefined is passed; 0 explicitly removes
		// timed auto-take behavior for an updated current/next PartInstance.
		expectedDuration: newData.part.expectedDuration ?? 0,
	}
	context.updatePartInstance(props)
}
