import type { BannerProject } from '../../app/types/banner-studio'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref, watch } from 'vue'
import {
  BOLD_RETAIL_LIFESTYLE,
  artworkDocumentKey,
  fitArtwork,
  reusableArtworkStyles,
  retainedArtworkConcepts
} from '../../app/utils/banner-artwork-creation'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onScopeDispose', () => {})
vi.stubGlobal('useAuth', () => ({ user: ref({ id: 'owner' }) }))
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 })
const { useBannerStudio }
  = await import('../../app/composables/useBannerStudio')
vi.stubGlobal('useBannerStudio', useBannerStudio)
const { useBannerArtworkCreation }
  = await import('../../app/composables/useBannerArtworkCreation')
const studio = useBannerStudio(),
  fetcher = vi.fn()
const projectId = '12345678-1234-4234-8234-123456789012',
  assetId = '12345678-1234-4234-8234-123456789013',
  revision = '2026-10-26T01:00:00.000Z'
function project() {
  return {
    id: projectId,
    clientId: null,
    name: 'Campaign',
    updatedAt: revision,
    canvasData: { custom_1000x1000: { layers: [] } }
  } as BannerProject
}
function setup() {
  const api = useBannerArtworkCreation(async () => ({
    width: 1000,
    height: 500
  }))
  api.brief.value = 'Leafy retail'
  api.copy.value = '$500 off Subaru\n11–14 November 2026'
  api.referenceIds.value = [assetId]
  return api
}
function result() {
  return {
    projectId,
    sourceRevision: revision,
    formatKey: 'custom_1000x1000',
    proposalId: 'concept-1',
    asset: { id: assetId, url: '/owned.png', width: 1000, height: 500, sha256: 'a'.repeat(64) },
    mode: 'generation',
    verification: 'review-required',
    referenceAssetIds: [assetId],
    evidence: {
      provider: 'fixture',
      model: 'fixture',
      requestId: null,
      cost: null
    },
    warnings: []
  }
}
beforeEach(() => {
  studio.loadProject(project())
  fetcher.mockReset()
  vi.stubGlobal('useBannerRealtime', () => ({ sendLayerAdd: vi.fn() }))
  vi.stubGlobal('$fetch', fetcher)
})
describe('campaign artwork review', () => {
  it('limits and validates retained metadata records', () => {
    expect(
      retainedArtworkConcepts([null, {}, { approvedCopy: 'bad' }])
    ).toEqual([])
  })
  it('lists only this project client references and only own assets for unassigned projects', async () => {
    const api = setup()
    fetcher
      .mockResolvedValueOnce({
        assets: [
          {
            id: 'owned',
            mimeType: 'image/png',
            clientId: null,
            uploadedBy: 'owner'
          },
          {
            id: 'other',
            mimeType: 'image/png',
            clientId: null,
            uploadedBy: 'other'
          },
          {
            id: 'foreign',
            mimeType: 'image/png',
            clientId: assetId,
            uploadedBy: 'owner'
          }
        ]
      })
      .mockResolvedValueOnce([])
    await api.show()
    expect(api.assets.value.map(asset => asset.id)).toEqual(['owned'])
    studio.state.project!.clientId = assetId
    fetcher.mockResolvedValueOnce({ assets: [] }).mockResolvedValueOnce([])
    await api.show()
    expect(fetcher.mock.calls[2][1].query).toEqual({ clientId: assetId })
  })
  it('rejects malformed metadata before adding or broadcasting a layer', async () => {
    const api = setup(),
      sendLayerAdd = vi.fn()
    vi.stubGlobal('useBannerRealtime', () => ({ sendLayerAdd }))
    fetcher
      .mockResolvedValueOnce({ updatedAt: revision })
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(result())
    await api.generate()
    api.reviewed.value = true
    api.preview.value!.proposalId = ''
    await api.apply()
    expect(studio.activeLayers.value).toHaveLength(0)
    expect(sendLayerAdd).not.toHaveBeenCalled()
    expect(api.error.value).toContain('metadata')
  })
  it('does not import an undecodable concept image', async () => {
    const api = useBannerArtworkCreation(async () => {
      throw new Error('Image decode failed')
    })
    api.brief.value = 'leafy'
    api.copy.value = 'approved'
    api.referenceIds.value = [assetId]
    fetcher
      .mockResolvedValueOnce({ updatedAt: revision })
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(result())
    await api.generate()
    api.reviewed.value = true
    await api.apply()
    expect(studio.activeLayers.value).toHaveLength(0)
    expect(api.error.value).toBe('Image decode failed')
  })
  it('ignores JSONB key ordering while detecting changed content', () => {
    expect(artworkDocumentKey({ x: 1, a: { z: 2, y: 3 } })).toBe(
      artworkDocumentKey({ a: { y: 3, z: 2 }, x: 1 })
    )
    expect(artworkDocumentKey({ x: 1 })).not.toBe(artworkDocumentKey({ x: 2 }))
  })
  it('contains artwork without cropping and rejects invalid dimensions', () => {
    expect(
      fitArtwork({ width: 1000, height: 500 }, { w: 100, h: 100 })
    ).toEqual({ x: 0, y: 25, w: 100, h: 50 })
    expect(() => fitArtwork({ width: 0, height: 1 }, { w: 1, h: 1 })).toThrow()
  })
  it('keeps distinct reusable guidance, strips campaign fields and scopes custom styles to their client', () => {
    const clientId = assetId
    const one = {
      ...BOLD_RETAIL_LIFESTYLE,
      id: 'leafy',
      name: 'Leafy retail',
      guidance: 'Angled blue type in a leafy park',
      variables: [...BOLD_RETAIL_LIFESTYLE.variables],
      reviewedProposalId: 'reviewed',
      reviewedAt: revision,
      approvedCopy: ['SECRET'],
      referenceAssetIds: ['private']
    }
    const two = {
      ...one,
      id: 'minimal',
      name: 'Quiet editorial',
      guidance: 'Fine serif typography with generous whitespace'
    }
    const source = {
      id: projectId,
      clientId,
      canvasData: {
        a: {
          artworkCreation: { styles: [one, two, { ...one, guidance: 42 }] }
        }
      }
    }
    const styles = reusableArtworkStyles([source], {
      projectId: 'different-project',
      clientId
    })
    expect(styles).toHaveLength(2)
    expect(styles.map(style => style.guidance)).toEqual([
      one.guidance,
      two.guidance
    ])
    expect(JSON.stringify(styles)).not.toMatch(/SECRET|private/)
    expect(
      reusableArtworkStyles([source], {
        projectId: 'different-project',
        clientId: null
      })
    ).toEqual([])
    expect(
      reusableArtworkStyles([source], {
        projectId: 'different-project',
        clientId: projectId
      })
    ).toEqual([])
    expect(
      reusableArtworkStyles(
        [
          {
            ...source,
            canvasData: { a: { artworkCreation: { styles: { bad: true } } } }
          }
        ],
        { projectId, clientId }
      )
    ).toEqual([])
  })
  it('chooses saved style guidance independently from campaign copy and reference inputs', async () => {
    const api = setup()
    api.styles.value = [
      {
        ...BOLD_RETAIL_LIFESTYLE,
        id: 'custom',
        version: 3,
        name: 'Quiet editorial',
        guidance: 'Fine serif typography',
        variables: [...BOLD_RETAIL_LIFESTYLE.variables],
        reviewedProposalId: 'reviewed',
        reviewedAt: revision,
        exampleAssetId: assetId
      }
    ]
    const originalCopy = api.copy.value
    api.referenceIds.value = []
    api.chooseStyle('custom:3')
    expect(api.styleGuidance.value).toBe('Fine serif typography')
    expect(api.styleName.value).toBe('Quiet editorial')
    expect(api.copy.value).toBe(originalCopy)
    expect(api.referenceIds.value).toEqual([])
    api.addStyleExample()
    expect(api.referenceIds.value).toEqual([assetId])
    fetcher
      .mockResolvedValueOnce({ updatedAt: revision })
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce({ updatedAt: revision })
    await api.generate()
    expect(fetcher.mock.calls[2][1].body.prompt).toContain(
      'Fine serif typography'
    )
    api.reviewed.value = true
    await api.apply()
    expect(
      studio.getCanvasData().custom_1000x1000.artworkCreation?.styles[0]
    ).toMatchObject({
      id: 'custom',
      version: 4,
      name: 'Quiet editorial',
      guidance: 'Fine serif typography'
    })
  })
  it('keeps exact copy, imports only after review, round-trips metadata, and undoes atomically', async () => {
    const api = setup()
    fetcher
      .mockResolvedValueOnce({ updatedAt: revision })
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce({ updatedAt: revision })
    await api.generate()
    expect(studio.activeLayers.value).toHaveLength(0)
    expect(api.canApply.value).toBe(false)
    expect(fetcher.mock.calls[2][1].body.approvedCopy).toEqual([
      '$500 off Subaru',
      '11–14 November 2026'
    ])
    api.reviewed.value = true
    await api.apply()
    const data = studio.getCanvasData()
    expect(
      data.custom_1000x1000.artworkCreation?.concepts[0]?.approvedCopy[0]
    ).toBe('$500 off Subaru')
    studio.undo()
    expect(studio.activeLayers.value).toHaveLength(0)
    expect(
      studio.getCanvasData().custom_1000x1000.artworkCreation
    ).toBeUndefined()
    studio.redo()
    studio.loadProject({ ...project(), canvasData: studio.getCanvasData() })
    expect(studio.getCanvasData()).toEqual(data)
  })
  it('rejects an edited and undone canvas during generation', async () => {
    const api = setup()
    let resolve!: (v: unknown) => void
    fetcher
      .mockResolvedValueOnce({ updatedAt: revision })
      .mockResolvedValueOnce(project())
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r
          })
      )
    const pending = api.generate()
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
    studio.addLayer({ type: 'text', text: 'change' })
    studio.undo()
    resolve(result())
    await pending
    expect(api.preview.value).toBeNull()
    expect(studio.activeLayers.value).toHaveLength(0)
  })
  it('surfaces provider failures without a placeholder result', async () => {
    const api = setup()
    fetcher
      .mockResolvedValueOnce({ updatedAt: revision })
      .mockResolvedValueOnce(project())
      .mockRejectedValueOnce({
        data: { statusMessage: 'Artwork generation is unavailable' }
      })
    await api.generate()
    expect(api.error.value).toBe('Artwork generation is unavailable')
    expect(api.preview.value).toBeNull()
    expect(studio.activeLayers.value).toHaveLength(0)
  })
  it('blocks applying a reviewed concept after project client changes', async () => {
    const api = setup()
    fetcher
      .mockResolvedValueOnce({ updatedAt: revision })
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(result())
    await api.generate()
    api.reviewed.value = true
    studio.state.project!.clientId = 'another-client'
    await api.apply()
    expect(studio.activeLayers.value).toHaveLength(0)
  })
  it('invalidates in-flight requests when inputs change programmatically', async () => {
    const api = setup()
    let resolve!: (v: unknown) => void
    fetcher
      .mockResolvedValueOnce({ updatedAt: revision })
      .mockResolvedValueOnce(project())
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r
          })
      )
    const pending = api.generate()
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
    api.styleGuidance.value = 'Another style'
    resolve(result())
    await pending
    expect(api.preview.value).toBeNull()
    expect(api.busy.value).toBe(false)
  })
  it('cancellation ignores late provider results and does not mutate the canvas', async () => {
    const api = setup()
    let resolve!: (v: unknown) => void
    fetcher
      .mockResolvedValueOnce({ updatedAt: revision })
      .mockResolvedValueOnce(project())
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r
          })
      )
    const pending = api.generate()
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
    api.discard()
    resolve(result())
    await pending
    expect(api.preview.value).toBeNull()
    expect(studio.activeLayers.value).toHaveLength(0)
  })
})
