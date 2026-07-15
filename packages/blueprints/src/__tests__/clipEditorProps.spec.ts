import { describe, expect, it } from 'vitest'
import { ObjectType, VideoObject } from '../common/definitions/objects.js'
import { parseClipEditorProps, parseClipProps } from '../base/showstyle/helpers/clips.js'

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
				attributes: { fileName: 'spravy/demo/clips/vo.mp4', sourceDuration: 11000 },
			})
		)

		expect(props).toEqual({
			fileName: 'spravy/demo/clips/vo.mp4',
			duration: 12000,
			sourceDuration: 11000,
		})
	})

	it('falls back to clipName when fileName is empty', () => {
		const props = parseClipEditorProps(
			makeVideo({
				clipName: 'spravy/demo/clips/fallback.mp4',
				attributes: { fileName: '' },
			})
		)

		expect(props?.fileName).toBe('spravy/demo/clips/fallback.mp4')
	})

	it('returns undefined when no path is set (avoids Softie stripExtension crash)', () => {
		expect(parseClipEditorProps(makeVideo({ attributes: {} }))).toBeUndefined()
		expect(parseClipProps(makeVideo({ clipName: '', attributes: {} }))).toBeUndefined()
	})
})
