import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 })
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')

const project = (key: string) => ({ id: 'test', canvasData: { [key]: { layers: [] } } }) as any

describe('Banner Studio initial canvas scale', () => {
  beforeEach(() => { useBannerStudio().state.wsScale = 0.22 })

  it('opens a saved MRec at actual size instead of the previous 22% scale', () => {
    const studio = useBannerStudio()
    studio.loadProject(project('mrec'))
    expect(studio.state.wsScale).toBe(1)
  })

  it('fits large social artwork, then restores actual size when opening an MRec', () => {
    const studio = useBannerStudio()
    studio.loadProject(project('ig_port'))
    expect(studio.state.wsScale).toBeGreaterThan(0.22)
    expect(studio.state.wsScale).toBeLessThan(1)
    studio.loadProject(project('mrec'))
    expect(studio.state.wsScale).toBe(1)
  })

  it('does not enlarge small banners automatically when switching sizes', () => {
    const studio = useBannerStudio()
    studio.loadProject({ id: 'test', canvasData: { mrec: { layers: [] }, ig_port: { layers: [] } } } as any)
    studio.setActiveArtboard('ig_port')
    studio.setActiveArtboard('mrec')
    expect(studio.state.wsScale).toBe(1)
  })
})

it('restores an imported custom canvas with its original dimensions', () => {
  const studio = useBannerStudio()
  studio.loadProject(project('custom_1092x1440'))
  expect(studio.activeFormat.value).toMatchObject({ w: 1092, h: 1440 })
  expect(studio.state.wsScale).toBeLessThan(1)
})
it('uses the measured canvas and leaves manual zoom alone when layout is unavailable', () => {
  const studio = useBannerStudio()
  studio.loadProject(project('mrec'))
  studio.zoomToFitFormat('mrec', { width: 700, height: 550 })
  expect(studio.state.wsScale).toBe(1)
  studio.zoomToFitFormat('mrec', { width: 250, height: 250 })
  expect(studio.state.wsScale).toBeLessThan(1)
  studio.state.wsScale = 1.5
  studio.zoomToFitFormat('mrec', { width: 0, height: 0 })
  expect(studio.state.wsScale).toBe(1.5)
})
