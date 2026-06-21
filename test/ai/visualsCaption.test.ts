import { describe, it, expect, vi } from 'vitest'
import { buildCaptionPrompt, parseCaption, toKnowledgeContent, describeAsset, type VisualAsset } from '~~/server/utils/ai/visuals/caption'

const asset = (over: Partial<VisualAsset> = {}): VisualAsset => ({ id: 'a1', kind: 'banner', url: 'https://r2/x.png', ...over })

describe('buildCaptionPrompt', () => {
  it('weaves context in and asks for JSON, without inventing a brand', () => {
    const p = buildCaptionPrompt(asset({ context: { clientName: 'Acme', campaignName: 'Spring' }, title: 'Hero A' }))
    expect(p).toContain('banner')
    expect(p).toContain('Client: Acme')
    expect(p).toContain('Campaign: Spring')
    expect(p).toContain('Title: Hero A')
    expect(p).toContain('Do not invent')
    expect(p).toContain('"caption"')
  })
  it('omits the context line when there is none', () => {
    expect(buildCaptionPrompt(asset())).not.toContain('Context —')
  })
})

describe('parseCaption', () => {
  it('parses clean JSON, lowercasing + deduping tags (cap 8)', () => {
    const { caption, tags } = parseCaption('{"caption":"A bold red sale banner","tags":["Sale","sale","RED","promo"]}')
    expect(caption).toBe('A bold red sale banner')
    expect(tags).toEqual(['sale', 'red', 'promo'])
  })
  it('strips code fences', () => {
    const { caption } = parseCaption('```json\n{"caption":"X","tags":[]}\n```')
    expect(caption).toBe('X')
  })
  it('salvages a bare line when the model ignores the JSON instruction', () => {
    const { caption, tags } = parseCaption('A minimalist product shot on white.')
    expect(caption).toBe('A minimalist product shot on white.')
    expect(tags).toEqual([])
  })
  it('empty/blank → empty', () => {
    expect(parseCaption('   ')).toEqual({ caption: '', tags: [] })
  })
})

describe('toKnowledgeContent', () => {
  it('composes a terse, searchable line with tags + capitalised kind', () => {
    const line = toKnowledgeContent({ assetId: 'a1', assetKind: 'proof', assetUrl: 'u', caption: 'Logo on dark bg', tags: ['logo', 'dark'], scope: 'user' })
    expect(line).toBe('Proof: Logo on dark bg [logo, dark]')
  })
})

describe('describeAsset', () => {
  it('returns a candidate scoped user by default with the asset link', async () => {
    const deps = { caption: vi.fn(async () => '{"caption":"A green CTA button","tags":["cta","green"]}') }
    const vk = await describeAsset(asset({ id: 'b9' }), deps)
    expect(vk).toMatchObject({ assetId: 'b9', assetKind: 'banner', assetUrl: 'https://r2/x.png', caption: 'A green CTA button', scope: 'user' })
    expect(vk!.tags).toEqual(['cta', 'green'])
  })
  it('fail-safe: a model error → null (never throws)', async () => {
    const vk = await describeAsset(asset(), { caption: async () => { throw new Error('vision down') } })
    expect(vk).toBeNull()
  })
  it('an empty caption → null (nothing to add to the KB)', async () => {
    const vk = await describeAsset(asset(), { caption: async () => '   ' })
    expect(vk).toBeNull()
  })
  it('a malformed asset → null without calling the model', async () => {
    const caption = vi.fn()
    expect(await describeAsset({ id: '', kind: 'image', url: '' }, { caption })).toBeNull()
    expect(caption).not.toHaveBeenCalled()
  })
})
