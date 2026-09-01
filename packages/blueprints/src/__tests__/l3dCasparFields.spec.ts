import { TSR } from '@sofie-automation/blueprints-integration'
import { describe, expect, it } from 'vitest'
import { parseGraphicsFromObjects } from '../base/showstyle/helpers/graphics.js'
import { ObjectType } from '../common/definitions/objects.js'
import { hybridCasparConfig } from './helpers/smokeRundownIngest.js'

function casparData(clipName: string, attributes: Record<string, string | undefined>) {
	const piece = parseGraphicsFromObjects(hybridCasparConfig, [
		{
			id: 'gfx1',
			objectType: ObjectType.Graphic,
			clipName,
			objectTime: 0,
			duration: 3000,
			isAdlib: false,
			attributes,
		},
	]).pieces[0]

	const caspar = piece?.content.timelineObjects?.[0]?.content as TSR.TimelineContentCCGTemplate
	return {
		templateName: caspar?.name,
		data: caspar?.data as Record<string, unknown>,
	}
}

describe('L3D Caspar template field contracts', () => {
	it('gfx/l3d-headline → headline + subline (not title/subtitle)', () => {
		const { templateName, data } = casparData('gfx/l3d-headline', {
			headline: 'Osobné údaje',
			subline: 'v OR SR',
		})
		expect(templateName).toBe('gfx/l3d-headline')
		expect(data).toEqual({ headline: 'Osobné údaje', subline: 'v OR SR' })
	})

	it('gfx/l3d-headline maps editor title/subtitle aliases to headline/subline', () => {
		const { data } = casparData('gfx/l3d-headline', {
			title: 'Editor title',
			subtitle: 'Editor subtitle',
		})
		expect(data).toEqual({ headline: 'Editor title', subline: 'Editor subtitle' })
	})

	it('gfx/l3d-tema → headline (title alias only)', () => {
		const { data } = casparData('gfx/l3d-tema', {
			headline: 'R. Fico o M. Ficovi',
			subline: 'ignored by template',
		})
		expect(data).toEqual({ headline: 'R. Fico o M. Ficovi', subline: 'ignored by template' })
	})

	it('gfx/l3d-sjv → headline + kicker', () => {
		const { data } = casparData('gfx/l3d-sjv', {
			headline: '4 mŕtvi v minibuse',
			kicker: 'SPRÁVY JEDNOU VETOU',
		})
		expect(data).toEqual({ headline: '4 mŕtvi v minibuse', kicker: 'SPRÁVY JEDNOU VETOU' })
	})

	it('gfx/l3d-sport defaults kicker to ŠPORT', () => {
		const { data } = casparData('gfx/l3d-sport', { headline: 'Slovan' })
		expect(data).toEqual({ headline: 'Slovan', kicker: 'ŠPORT' })
	})

	it('gfx/l3d-predstavovak → name + title (headline/subline aliases)', () => {
		const { data } = casparData('gfx/l3d-predstavovak', {
			headline: 'Gabi',
			subline: 'moderátorka',
		})
		expect(data).toEqual({ name: 'Gabi', title: 'moderátorka' })
	})

	it('gfx/l3d-mod → name + title', () => {
		const { data } = casparData('gfx/l3d-mod', { name: 'Moderátor', title: 'Anchor' })
		expect(data).toEqual({ name: 'Moderátor', title: 'Anchor' })
	})

	it('gfx/l3d-syn maps role → title for l3d-syn.html', () => {
		const { data } = casparData('gfx/l3d-syn', {
			name: 'Boris Susko',
			role: 'minister spravodlivosti (SMER-SD)',
		})
		expect(data).toEqual({
			name: 'Boris Susko',
			title: 'minister spravodlivosti (SMER-SD)',
		})
		expect(data).not.toHaveProperty('role')
	})

	it('gfx/l3d-odporucanie resolves to gfx/outro with headline', () => {
		const { templateName, data } = casparData('gfx/l3d-odporucanie', {
			headline: 'Sledujte na www.360tka.sk',
		})
		expect(templateName).toBe('gfx/outro')
		expect(data).toEqual({ headline: 'Sledujte na www.360tka.sk' })
	})
})
