import { describe, expect, it } from 'vitest'
import { legacySocialImageKey, validateRecompositionSource } from '../../../server/utils/socialPublishing/imageRecomposition'
const source = 'https://bucket.example/banner-assets/user/00000000-0000-4000-8000-000000000000/source.png?signature=abc'
const post = { client_id: 'client', status: 'draft', media_urls: [source] }
describe('image recomposition authority', () => {
  it('accepts an attached image on an editable draft', () => {
    expect(() => validateRecompositionSource(post, 'client', source)).not.toThrow()
  })
  it('rejects cross-client requests, changed images and published content', () => {
    expect(() => validateRecompositionSource(post, 'other', source)).toThrow('not found')
    expect(() => validateRecompositionSource(post, 'client', 'https://other/image')).toThrow('Save this attached image')
    expect(() => validateRecompositionSource({ ...post, status: 'published' }, 'client', source)).toThrow('Only draft')
  })
  it('resolves only the configured bucket and creator namespace', () => {
    expect(legacySocialImageKey(source, 'user', 'https://bucket.example')).toBe('banner-assets/user/00000000-0000-4000-8000-000000000000/source.png')
    expect(legacySocialImageKey(source, 'other', 'https://bucket.example')).toBeNull()
    expect(legacySocialImageKey(source, 'user', 'https://another.example')).toBeNull()
    expect(legacySocialImageKey(source.replace('source.png', '%2e%2e%2fsecret.png'), 'user', 'https://bucket.example')).toBeNull()
  })
})
