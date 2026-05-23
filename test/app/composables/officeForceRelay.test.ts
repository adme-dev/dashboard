import { describe, it, expect } from 'vitest'
import { resolveForceRelay } from '~/app/composables/officeForceRelay'

describe('resolveForceRelay', () => {
  it('returns false when officeForceRelay is undefined', () => {
    expect(resolveForceRelay({ public: {} })).toBe(false)
  })

  it('returns true when officeForceRelay is boolean true', () => {
    expect(resolveForceRelay({ public: { officeForceRelay: true } })).toBe(true)
  })

  it('returns false when officeForceRelay is boolean false', () => {
    expect(resolveForceRelay({ public: { officeForceRelay: false } })).toBe(false)
  })

  it('returns false when officeForceRelay is the string "false"', () => {
    expect(resolveForceRelay({ public: { officeForceRelay: 'false' } })).toBe(false)
  })

  it('returns false when officeForceRelay is the string "true" — strict boolean only', () => {
    // Strict boolean comparison: only `true` (boolean) flips. String "true" does not.
    // Pages env vars come as strings; if someone sets NUXT_PUBLIC_OFFICE_FORCE_RELAY=true,
    // Nuxt's runtime config layer coerces it. This test documents that resolveForceRelay
    // does NOT do additional string coercion — that's Nuxt's job.
    expect(resolveForceRelay({ public: { officeForceRelay: 'true' } })).toBe(false)
  })

  it('returns false for any non-true value', () => {
    expect(resolveForceRelay({ public: { officeForceRelay: 1 } })).toBe(false)
    expect(resolveForceRelay({ public: { officeForceRelay: null } })).toBe(false)
  })
})
