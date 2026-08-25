import { describe, expect, it } from 'vitest'
import { ObjectType, VideoObject } from '../common/definitions/objects.js'
import { parseClipEditorProps, parseClipProps, resolveClipPlayback } from '../base/showstyle/helpers/clips.js'

function makeVideo(overrides: Partial<VideoObject> & { attributes?: VideoObject['attributes'] }): VideoObject {
	return {
		id: 'v1',
		objectType: ObjectType.Video,
		objectTime: 0,
		duration: 5000,
		clipName: '',
		attributes: {},
		...overrides,
	}
}

describe('parseClipEditorProps', () => {
	it('uses attributes.fileName and keeps duration in ms (no second *1000)', () => {
		const props = parseClipEditorProps(
			makeVideo({
				duration: 12000,
				attributes: { fileName: 'clips/vo.mp4', sourceDuration: 11000 },
			})
		)

		expect(props).toEqual({
			fileName: 'clips/vo.mp4',
			duration: 12000,
			sourceDuration: 11000,
			trimInMs: undefined,
			trimOutMs: undefined,
			volume: 1,
		})
	})

	it('falls back to clipName when fileName is empty', () => {
		const props = parseClipEditorProps(
			makeVideo({
				clipName: 'clips/fallback.mp4',
				attributes: { fileName: '' },
			})
		)

		expect(props?.fileName).toBe('clips/fallback.mp4')
	})

	it('returns undefined when no path is set (avoids Softie stripExtension crash)', () => {
		expect(parseClipEditorProps(makeVideo({ attributes: {} }))).toBeUndefined()
		expect(parseClipProps(makeVideo({ clipName: '', attributes: {} }))).toBeUndefined()
	})

	it('parses trim in/out seconds and percent volume', () => {
		const props = parseClipEditorProps(
			makeVideo({
				duration: 20000,
				attributes: {
					fileName: 'clips/syn.mp4',
					sourceDuration: 18000,
					trimIn: 1.5,
					trimOut: 0.5,
					volume: 80,
				},
			})
		)

		expect(props?.trimInMs).toBe(1500)
		expect(props?.trimOutMs).toBe(500)
		expect(props?.volume).toBe(0.8)
	})
})

describe('resolveClipPlayback', () => {
	it('subtracts trim in/out from source duration', () => {
		expect(
			resolveClipPlayback({
				fileName: 'clips/syn.mp4',
				sourceDuration: 12000,
				trimInMs: 2000,
				trimOutMs: 1000,
			})
		).toEqual({ seekMs: 2000, durationMs: 9000, volume: 1 })
	})

	it('uses the shorter of editorial duration and trimmed source', () => {
		expect(
			resolveClipPlayback({
				fileName: 'clips/syn.mp4',
				duration: 5000,
				sourceDuration: 12000,
				trimInMs: 1000,
			})
		).toEqual({ seekMs: 1000, durationMs: 5000, volume: 1 })
	})
})
