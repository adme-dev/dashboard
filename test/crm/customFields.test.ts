import { describe, it, expect } from 'vitest'
import { validateCustomFields, type FieldDef } from '~~/server/utils/crm/customFields'

const defs: FieldDef[] = [
  { key: 'tier', field_type: 'dropdown', options: ['gold', 'silver'] },
  { key: 'score', field_type: 'number', options: [] },
]

describe('validateCustomFields', () => {
  it('passes known keys with valid values and drops unknown keys', () => {
    const out = validateCustomFields(defs, { tier: 'gold', score: 5, bogus: 'x' })
    expect(out).toEqual({ tier: 'gold', score: 5 })
  })

  it('throws on a dropdown value not in options', () => {
    expect(() => validateCustomFields(defs, { tier: 'bronze' })).toThrow(/tier/)
  })

  it('throws on a non-numeric number field', () => {
    expect(() => validateCustomFields(defs, { score: 'abc' })).toThrow(/score/)
  })
})
