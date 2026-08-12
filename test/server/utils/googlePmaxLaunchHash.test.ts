import { describe, expect, it } from 'vitest'
import {
  hashCanonicalLaunchJson,
  serializeCanonicalLaunchJson
} from '~~/server/utils/googlePmaxLaunchHash'

describe('Google PMax canonical launch JSON', () => {
  it('uses deterministic code-point key ordering and ignores object insertion order', () => {
    const first = { z: 1, ä: 2, A: 3, nested: { b: true, a: false } }
    const second = { nested: { a: false, b: true }, A: 3, ä: 2, z: 1 }

    expect(serializeCanonicalLaunchJson(first)).toBe('{"A":3,"nested":{"a":false,"b":true},"z":1,"ä":2}')
    expect(hashCanonicalLaunchJson(first)).toBe(hashCanonicalLaunchJson(second))
  })

  it('changes the hash when material configuration changes', () => {
    expect(hashCanonicalLaunchJson({ budgetMicros: 1_000_000 }))
      .not.toBe(hashCanonicalLaunchJson({ budgetMicros: 2_000_000 }))
  })

  it('rejects accessor-backed properties instead of hashing mutable observations', () => {
    const config = Object.defineProperty({}, 'budgetMicros', {
      enumerable: true,
      get: () => 1_000_000
    })

    expect(() => serializeCanonicalLaunchJson(config)).toThrow(/enumerable data properties/)
  })

  it('rejects huge sparse arrays before allocating by their declared length', () => {
    expect(() => serializeCanonicalLaunchJson({ steps: Array(100_000_000) })).toThrow(/safe item limit/)
  })
})
