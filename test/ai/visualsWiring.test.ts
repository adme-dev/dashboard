import { describe, it, expect, vi } from 'vitest'
import { makeWorkersAiVision, VISION_MODEL, type AiBinding } from '~~/server/utils/ai/visuals/vision'
import { createVisualKnowledgeDraft, type DraftDb } from '~~/server/utils/ai/visuals/draft'
import { describeAsset, type VisualAsset, type VisualKnowledge } from '~~/server/utils/ai/visuals/caption'

describe('makeWorkersAiVision', () => {
  const okBytes = async () => new Uint8Array([1, 2, 3])

  it('fetches bytes and calls the llava vision model, returning its text', async () => {
    const run = vi.fn().mockResolvedValue({ description: '{"caption":"a logo","tags":["logo"]}' })
    const ai: AiBinding = { run }
    const caption = makeWorkersAiVision(ai, okBytes)
    const out = await caption('prompt', 'https://r2/private/asset.png')
    expect(out).toContain('a logo')
    expect(run).toHaveBeenCalledWith(VISION_MODEL, expect.objectContaining({ image: [1, 2, 3], prompt: 'prompt' }))
  })

  it('falls back to result.response when description is absent', async () => {
    const ai: AiBinding = { run: vi.fn().mockResolvedValue({ response: 'plain text' }) }
    expect(await makeWorkersAiVision(ai, okBytes)('p', 'u')).toBe('plain text')
  })

  it('returns "" with no AI binding (dormant / no edge)', async () => {
    expect(await makeWorkersAiVision(null, okBytes)('p', 'u')).toBe('')
  })

  it('returns "" when the asset cannot be fetched', async () => {
    const ai: AiBinding = { run: vi.fn() }
    expect(await makeWorkersAiVision(ai, async () => null)('p', 'u')).toBe('')
    expect(ai.run).not.toHaveBeenCalled()
  })

  it('is fail-safe: a model error yields "" (never throws)', async () => {
    const ai: AiBinding = { run: vi.fn().mockRejectedValue(new Error('model down')) }
    expect(await makeWorkersAiVision(ai, okBytes)('p', 'u')).toBe('')
  })

  it('composes with describeAsset end-to-end (bytes → caption → candidate)', async () => {
    const ai: AiBinding = { run: vi.fn().mockResolvedValue({ description: '{"caption":"Acme banner, blue","tags":["banner","blue","acme"]}' }) }
    const asset: VisualAsset = { id: 'a1', kind: 'banner', url: 'https://r2/x.png', context: { clientName: 'Acme' } }
    const vk = await describeAsset(asset, { caption: makeWorkersAiVision(ai, okBytes) })
    expect(vk).toMatchObject({ assetId: 'a1', assetKind: 'banner', scope: 'user', caption: 'Acme banner, blue' })
    expect(vk!.tags).toContain('banner')
  })
})

describe('createVisualKnowledgeDraft', () => {
  const vk: VisualKnowledge = {
    assetId: 'a1', assetKind: 'proof', assetUrl: 'https://r2/p.png',
    caption: 'Logo on dark background', tags: ['logo', 'dark'], scope: 'user'
  }
  const fakeDb = (over: Partial<DraftDb> = {}): DraftDb => ({
    queryOne: vi.fn().mockResolvedValue({ id: 'kb-1' }),
    ...over
  })

  it('inserts an UNPUBLISHED draft (never auto-published) and returns the id', async () => {
    const queryOne = vi.fn().mockResolvedValue({ id: 'kb-1' })
    const id = await createVisualKnowledgeDraft(vk, { authorId: 'u1' }, fakeDb({ queryOne }))
    expect(id).toBe('kb-1')
    const [sql, params] = queryOne.mock.calls[0]!
    expect(sql).toContain('is_published')
    expect(sql).toContain('FALSE')
    expect(sql).toContain('\'draft\'')
    // title, content, category, authorId
    expect(params[0]).toContain('Visual:')
    expect(params[1]).toContain('Logo on dark background')
    expect(params[1]).toContain('Asset: https://r2/p.png') // links back to the visual
    expect(params[3]).toBe('u1')
  })

  it('truncates a long caption into the title', async () => {
    const queryOne = vi.fn().mockResolvedValue({ id: 'kb-2' })
    const long = { ...vk, caption: 'x'.repeat(120) }
    await createVisualKnowledgeDraft(long, {}, fakeDb({ queryOne }))
    expect(queryOne.mock.calls[0]![1][0].length).toBeLessThanOrEqual('Visual: '.length + 61 + 1)
  })

  it('throws if the insert returns no row', async () => {
    await expect(createVisualKnowledgeDraft(vk, {}, fakeDb({ queryOne: vi.fn().mockResolvedValue(null) }))).rejects.toThrow()
  })
})
