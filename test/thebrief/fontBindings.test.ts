import { describe, expect, it } from 'vitest'
import { bindImportedFontFace, findImportedFontFace, type ImportedFontFace } from '../../app/utils/thebrief-font-bindings'

const prepared = { family: 'Dealer Sans', weight: 325, sha256: 'a'.repeat(64) }
const face = (extra: Partial<ImportedFontFace> = {}): ImportedFontFace => ({
  id: 'face-a', name: prepared.family, tags: ['font', 'weight:325'], clientId: 'client-a', sha256: prepared.sha256, ...extra
})

describe('TheBrief imported font identity', () => {
  it('prefers the exact client face over a shared matching face', () => {
    const shared = face({ id: 'shared', clientId: null })
    const owned = face()
    expect(findImportedFontFace([shared, owned], prepared, 'client-a')).toBe(owned)
    expect(findImportedFontFace([shared], prepared, 'client-a')).toBe(shared)
  })

  it('never reuses a name-only, different-byte, different-weight or other-client face', () => {
    const candidates = [
      face({ sha256: null }), face({ sha256: 'b'.repeat(64) }),
      face({ tags: ['font', 'weight:400'] }), face({ clientId: 'client-b' }),
      face({ tags: ['weight:325'] }),
      face({ clientId: undefined }), face({ name: 'Other Sans' })
    ]
    expect(findImportedFontFace(candidates, prepared, 'client-a')).toBeUndefined()
  })

  it('binds only the exact imported face across sizes without changing artwork or weights', () => {
    const boards = {
      square: { layers: [{ fontFamily: prepared.family, fontWeight: 325, text: 'Offer' }, { fontFamily: prepared.family, fontWeight: 700 }] },
      story: { layers: [{ fontFamily: prepared.family, fontWeight: 325 }, { fontFamily: 'Other Sans', fontWeight: 325 }] }
    }
    bindImportedFontFace(boards, prepared, face(), 'client-a')
    expect(boards).toEqual({
      square: { layers: [{ fontFamily: prepared.family, fontWeight: 325, text: 'Offer', fontAssetId: 'face-a' }, { fontFamily: prepared.family, fontWeight: 700 }] },
      story: { layers: [{ fontFamily: prepared.family, fontWeight: 325, fontAssetId: 'face-a' }, { fontFamily: 'Other Sans', fontWeight: 325 }] }
    })
  })

  it('rejects a mismatched upload response before binding any layout', () => {
    const boards = { square: { layers: [{ fontFamily: prepared.family, fontWeight: 325 }] } }
    expect(() => bindImportedFontFace(boards, prepared, face({ clientId: 'client-b' }), 'client-a')).toThrow('client scope')
    expect(boards.square.layers[0]).not.toHaveProperty('fontAssetId')
  })
})
