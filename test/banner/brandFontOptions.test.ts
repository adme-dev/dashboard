import { describe, expect, it } from 'vitest'
import { brandFontOptions, fontOptionIncludes, selectableBrandKitFontFaces } from '../../app/utils/banner-brand-font-options'

const face = (id: string, weight: number, brand = 'gwm') => ({ id, name: 'Montserrat', clientId: null, tags: [`weight:${weight}`, `motorstack-brand:${brand}`] })
describe('brand font picker identities', () => {
  it('shows only the current OEM files and unbranded files already linked to that kit', () => {
    const own = face('a', 400, 'gwm')
    const foreign = face('b', 400, 'kia')
    const shared = { id: 'c', name: 'Open Sans', clientId: null, tags: ['weight:400'] }
    expect(selectableBrandKitFontFaces([own, foreign, shared], 'gwm', new Set(['c'])).map(item => item.id)).toEqual(['a', 'c'])
    expect(selectableBrandKitFontFaces([own, foreign, shared], null, new Set()).map(item => item.id)).toEqual(['c'])
  })
  it('separates two OEMs with equal family and weight into named choices', () => {
    const choices = brandFontOptions([face('a', 400), face('b', 400, 'kia')], new Map([['gwm', 'GWM'], ['kia', 'Kia']]))
    expect(choices.map(choice => choice.label)).toEqual(['Montserrat · GWM · MotorStack', 'Montserrat · Kia · MotorStack'])
    expect(choices.map(choice => choice.assets)).toEqual([[{ id: 'a', weight: 400 }], [{ id: 'b', weight: 400 }]])
  })
  it('retains alternate files within one OEM and keeps other available weights', () => {
    const choices = brandFontOptions([face('a', 400), face('b', 400), face('c', 700)])
    expect(choices.map(choice => choice.assets)).toEqual([
      [{ id: 'a', weight: 400 }, { id: 'c', weight: 700 }],
      [{ id: 'b', weight: 400 }, { id: 'c', weight: 700 }]
    ])
    expect(choices[1].value).not.toBe(choices[0].value)
  })
  it('matches every saved identity rather than any overlapping weight', () => {
    const choices = brandFontOptions([face('a', 400), face('b', 400), face('c', 700)])
    const saved = { family: 'Montserrat', assets: [{ id: 'B', weight: 400 }, { id: 'c', weight: 700 }] }
    expect(fontOptionIncludes(choices[0], saved)).toBe(false)
    expect(fontOptionIncludes(choices[1], saved)).toBe(true)
  })
})
