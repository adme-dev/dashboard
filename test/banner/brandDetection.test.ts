import { describe, expect, it } from 'vitest'
import { detectBannerBrandKit } from '../../app/utils/banner-brand-detection'
import type { BannerBrandKit, BannerProject } from '../../app/types/banner-studio'

const kit = (brand: string, extra = {}) => ({ id: brand, name: `${brand} Auto Australia`, sourceUrl: `https://oem-variants.pages.dev/api/mcp#brand=${brand.toLowerCase()}`, clientId: null, isDefault: false, fonts: [], ...extra } as BannerBrandKit)
const project = (name: string, extra = {}) => ({ id: 'project', name, clientId: 'dealer', clientName: 'Kevin Dennis Motor Group', tags: [], canvasData: {}, ...extra } as BannerProject)
const kits = [kit('Geely'), kit('GWM'), kit('MG'), kit('Ford')]

describe('project brand kit detection', () => {
  it('finds GEELY from a campaign under a multi-brand dealer, regardless of casing', () => {
    expect(detectBannerBrandKit(project('Geely Deer Park EX2 Finance'), kits)?.id).toBe('Geely')
    expect(detectBannerBrandKit(project('geely billboard'), kits)?.id).toBe('Geely')
    expect(detectBannerBrandKit(project('GWM Launch', { clientName: 'Geely and GWM dealer' }), kits)?.id).toBe('GWM')
  })
  it('honours an explicit kit and a client default, never selecting another client’s kit', () => {
    expect(detectBannerBrandKit(project('Geely', { tags: ['brand-kit:GWM'] }), kits)?.id).toBe('GWM')
    expect(detectBannerBrandKit(project('Geely'), [...kits, kit('Dealer', { clientId: 'dealer', isDefault: true })])?.id).toBe('Dealer')
    expect(detectBannerBrandKit(project('Private brand'), [kit('Private brand', { clientId: 'other' })])).toBeUndefined()
    expect(detectBannerBrandKit(project('Private brand', { tags: ['brand-kit:Private brand'] }), [kit('Private brand', { clientId: 'other' })])).toBeUndefined()
  })
  it('keeps ambiguous or unknown branding unselected and matches complete words', () => {
    expect(detectBannerBrandKit(project('Geely and GWM sale'), kits)).toBeUndefined()
    expect(detectBannerBrandKit(project('AMG finance'), kits)).toBeUndefined()
    expect(detectBannerBrandKit(project('Unknown event'), kits)).toBeUndefined()
    expect(detectBannerBrandKit(project('Geely'), [...kits, kit('Geely', { id: 'duplicate' })])).toBeUndefined()
  })
  it('uses unique managed font identity as a fallback and does not mutate artwork', () => {
    const p = project('EX2', { canvasData: { story: { layers: [{ fontAssetId: 'geely-bold', text: '0.09' }] } } })
    const before = JSON.stringify(p)
    const branded = kit('Geely', { fonts: [{ family: 'GEELY Bold', assets: [{ id: 'geely-bold', weight: 600 }] }] })
    expect(detectBannerBrandKit(p, [branded, kits[1]!])?.id).toBe('Geely')
    expect(JSON.stringify(p)).toBe(before)
    expect(detectBannerBrandKit(p, [branded, { ...branded, id: 'duplicate' }])).toBeUndefined()
  })
})
