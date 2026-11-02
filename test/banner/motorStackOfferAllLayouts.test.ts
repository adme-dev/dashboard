import { describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'
import type { BannerAsset, BannerBrandKit, BannerProject } from '~/types/banner-studio'
import { bannerOfferLayers, type BannerMotorStackOffer } from '~/utils/banner-offer'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 })
const { useBannerStudio } = await import('~/composables/useBannerStudio')

const kit = { id: 'subaru', name: 'Subaru', colors: [{ role: 'background', hex: '#ffffff' }, { role: 'text', hex: '#111111' }],
  fonts: [{ role: 'heading', family: 'Subaru Sans', weights: [700] }], logos: [] } as BannerBrandKit
const offer = { title: 'Forester driveaway $45,990', model: 'Forester', variant: null, price: 45990, priceLabel: null,
  offer: 'Explore the Forester range.', endDate: '2026-11-30', disclaimer: 'Full terms apply. Finance subject to approval.',
  hasImage: true, artworkAssetId: 'a'.repeat(64), artworkPreviewUrl: '/api/offer-artwork' } as BannerMotorStackOffer
const image = { id: 'saved', name: 'Forester offer hero', url: '/managed/forester.jpg', mimeType: 'image/jpeg' } as BannerAsset

describe('MotorStack offer placement', () => {
  it('keeps full editable copy and terms, with geometry inside small and portrait layouts', () => {
    for (const format of [{ w: 300, h: 250 }, { w: 1080, h: 1920 }]) {
      const pieces = bannerOfferLayers(offer, kit, format, image)
      expect(pieces.map(piece => piece.role)).toEqual(['hero', 'headline', 'detail', 'terms'])
      expect(pieces.find(piece => piece.role === 'hero')?.layer).toMatchObject({ src: image.url, fit: 'contain' })
      expect(pieces.find(piece => piece.role === 'headline')?.layer.text).toBe(offer.title)
      expect(pieces.find(piece => piece.role === 'terms')?.layer.text).toContain(offer.disclaimer)
      expect(pieces.find(piece => piece.role === 'terms')?.layer.text).toContain('Offer ends 2026-11-30')
      expect(pieces.every(({ layer }) => (layer.x || 0) + (layer.w || 0) <= format.w && (layer.y || 0) + (layer.h || 0) <= format.h)).toBe(true)
    }
  })

  it('adds linked pieces to every size as one undo step, on corresponding slides', () => {
    const studio = useBannerStudio()
    studio.loadProject({ id: 'offer-all', name: 'Offer', canvasData: {
      mrec: { slides: [{ id: 'small-1', name: 'Intro', duration: 3 }, { id: 'small-2', name: 'Offer', duration: 4 }], layers: [] },
      leader: { slides: [{ id: 'wide-1', name: 'Intro', duration: 2 }, { id: 'wide-2', name: 'Offer', duration: 5 }], layers: [] }
    } } as BannerProject)
    studio.state.layoutView = 'single'
    studio.state.currentTime = 4
    expect(studio.addMotorStackOfferToAllLayouts(offer, kit, image)).toBe(2)
    const first = studio.state.sets.mrec!.layers
    const second = studio.state.sets.leader!.layers
    expect(first.map(layer => layer.type)).toEqual(['image', 'text', 'text', 'text'])
    expect(first[0]).toMatchObject({ slideId: 'small-2', startTime: 3, endTime: 7 })
    expect(second[0]).toMatchObject({ slideId: 'wide-2', startTime: 2, endTime: 7 })
    expect(first.map(layer => layer.linkId)).toEqual(second.map(layer => layer.linkId))
    expect(new Set([...first, ...second].map(layer => layer.id)).size).toBe(8)
    expect(studio.state.selectedLayerId).toBe(first[1]!.id)
    studio.undo()
    expect(studio.state.setKeys.every(key => studio.state.sets[key]!.layers.length === 0)).toBe(true)
    studio.redo()
    expect(studio.state.setKeys.every(key => studio.state.sets[key]!.layers.length === 4)).toBe(true)
  })

  it('adds text and end date when MotorStack has no importable hero image', () => {
    const pieces = bannerOfferLayers({ ...offer, artworkAssetId: null, artworkPreviewUrl: null, hasImage: false }, kit, { w: 300, h: 250 })
    expect(pieces.some(piece => piece.role === 'hero')).toBe(false)
    expect(pieces.some(piece => piece.role === 'terms')).toBe(true)
  })
})
