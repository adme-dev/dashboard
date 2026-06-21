import { describe, it, expect } from 'vitest'
import { ROLE_DEFAULT_PERSONA, roleDefaultPersona } from '~~/server/utils/ai/rolePersona'
import { PERSONAS } from '~~/server/utils/ai/personas'

describe('rolePersona', () => {
  it('maps a media_buyer role to the media_buyer skill-pack', () => {
    expect(roleDefaultPersona('media_buyer')).toBe('media_buyer')
  })

  it('maps finance/accounts roles to the finance pack', () => {
    expect(roleDefaultPersona('finance')).toBe('finance')
    expect(roleDefaultPersona('accounts')).toBe('finance')
  })

  it('every mapped persona key is a real persona (no dangling keys)', () => {
    for (const [role, key] of Object.entries(ROLE_DEFAULT_PERSONA)) {
      expect(PERSONAS[key], `role "${role}" → unknown persona "${key}"`).toBeDefined()
    }
  })

  it('an unmapped role returns undefined (engine falls back to the generalist)', () => {
    expect(roleDefaultPersona('developer')).toBeUndefined()
    expect(roleDefaultPersona('member')).toBeUndefined()
    expect(roleDefaultPersona('')).toBeUndefined()
    expect(roleDefaultPersona(undefined)).toBeUndefined()
  })
})

describe('media_buyer persona', () => {
  it('is registered with a MEDIA_BUYING-focused allowlist', () => {
    const p = PERSONAS.media_buyer
    expect(p).toBeDefined()
    expect(p!.toolAllowlist).toContain('get_adspend_pacing')
    expect(p!.toolAllowlist).toContain('search_knowledge')
    expect(p!.instructionsPreamble.toLowerCase()).toContain('media buyer')
  })
})
