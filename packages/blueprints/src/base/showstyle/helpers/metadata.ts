export interface RundownMetadata {
	ingestType: string
	/**
	 * Editorial segment snapshot written at getRundown — restored into
	 * getSegment so a lone segment regenerated after a worker restart still
	 * resolves its vMix bed against the segments before it.
	 */
	vmixBedSegments?: Array<{ externalId: string; rank: number; name: string }>
}
