import { describe, it, expect, vi } from 'vitest'
import {
  isVisualsToKnowledgeEnabled,
  isCaptionableType,
  captionAndDraftAssets,
  type CaptionDraftDeps
} from '~~/server/utils/ai/visuals/trigger'
import type { VisualAsset } from '~~/server/utils/ai/visuals/caption'

describe('isVisualsToKnowledgeEnabled', () => {
  it('is off unless the flag is exactly "true"', () => {
    expect(isVisualsToKnowledgeEnabled({})).toBe(false)
    expect(isVisualsToKnowledgeEnabled({ VISUALS_TO_KNOWLEDGE_ENABLED: 'false' })).toBe(false)
    expect(isVisualsToKnowledgeEnabled({ VISUALS_TO_KNOWLEDGE_ENABLED: '1' })).toBe(false)
    expect(isVisualsToKnowledgeEnabled({ VISUALS_TO_KNOWLEDGE_ENABLED: 'true' })).toBe(true)
  })
})

describe('isCaptionableType', () => {
  it('accepts images only', () => {
    expect(isCaptionableType('image/png')).toBe(true)
    expect(isCaptionableType('image/jpeg')).toBe(true)
    expect(isCaptionableType('application/pdf')).toBe(false)
    expect(isCaptionableType('video/mp4')).toBe(false)
    expect(isCaptionableType(null)).toBe(false)
    expect(isCaptionableType(undefined)).toBe(false)
  })
})

describe('captionAndDraftAssets', () => {
  const assets: VisualAsset[] = [
    { id: 'a1', kind: 'proof', url: 'https://r2/1.png' },
    { id: 'a2', kind: 'proof', url: 'https://r2/2.png' }
  ]

  it('captions each asset and writes a draft for the ones that yield a caption', async () => {
    const saveDraft = vi.fn(async () => 'kb-x')
    const deps: CaptionDraftDeps = {
      caption: async () => '{"caption":"a thing","tags":["t"]}',
      saveDraft
    }
    expect(await captionAndDraftAssets(assets, deps)).toBe(2)
    expect(saveDraft).toHaveBeenCalledTimes(2)
    expect(saveDraft.mock.calls[0]![0]).toMatchObject({ assetId: 'a1', caption: 'a thing', scope: 'user' })
  })

  it('skips assets the vision model gives no caption for (fail-safe describe → null)', async () => {
    const saveDraft = vi.fn(async () => 'kb-x')
    let n = 0
    const deps: CaptionDraftDeps = {
      caption: async () => (n++ === 0 ? '' : '{"caption":"ok"}'), // first asset → no caption
      saveDraft
    }
    expect(await captionAndDraftAssets(assets, deps)).toBe(1)
    expect(saveDraft).toHaveBeenCalledTimes(1)
  })

  it('one save failure does not abort the rest', async () => {
    const saveDraft = vi.fn()
      .mockRejectedValueOnce(new Error('constraint race'))
      .mockResolvedValueOnce('kb-2')
    const deps: CaptionDraftDeps = { caption: async () => '{"caption":"ok"}', saveDraft: saveDraft as CaptionDraftDeps['saveDraft'] }
    expect(await captionAndDraftAssets(assets, deps)).toBe(1)
    expect(saveDraft).toHaveBeenCalledTimes(2)
  })

  it('a caption-fn throw is swallowed by describeAsset (asset skipped, no throw)', async () => {
    const deps: CaptionDraftDeps = {
      caption: async () => { throw new Error('vision down') },
      saveDraft: vi.fn(async () => 'kb')
    }
    expect(await captionAndDraftAssets(assets, deps)).toBe(0)
  })
})
