// test/crm/engine/validateRecord.test.ts
import { describe, it, expect } from 'vitest'
import { validateRecord, type ValidatorFieldDef } from '~~/server/utils/crm/engine/validateRecord'

const defs: ValidatorFieldDef[] = [
  { key: 'name', field_type: 'text', options: [], relation_target: null, is_required: true },
  { key: 'price', field_type: 'currency', options: [], relation_target: null, is_required: false },
  { key: 'category', field_type: 'dropdown', options: ['a', 'b'], relation_target: null, is_required: false },
  { key: 'email', field_type: 'email', options: [], relation_target: null, is_required: false },
  { key: 'customer', field_type: 'relation', options: [], relation_target: 'person', is_required: false },
]

describe('validateRecord', () => {
  it('keeps known valid values, coerces numbers, drops unknown keys', () => {
    const out = validateRecord(defs, { name: 'Widget', price: '9.5', bogus: 'x' })
    expect(out).toEqual({ name: 'Widget', price: 9.5 })
  })

  it('throws when a required field is missing or empty', () => {
    expect(() => validateRecord(defs, { price: 5 })).toThrow(/name/)
    expect(() => validateRecord(defs, { name: '' })).toThrow(/name/)
  })

  it('throws on a dropdown value not in options', () => {
    expect(() => validateRecord(defs, { name: 'W', category: 'z' })).toThrow(/category/)
  })

  it('throws on a malformed email', () => {
    expect(() => validateRecord(defs, { name: 'W', email: 'nope' })).toThrow(/email/)
  })

  it('throws on a non-uuid relation value', () => {
    expect(() => validateRecord(defs, { name: 'W', customer: 'not-a-uuid' })).toThrow(/customer/)
  })

  it('accepts a uuid relation value (existence checked separately at the DB layer)', () => {
    const out = validateRecord(defs, { name: 'W', customer: '11111111-1111-1111-1111-111111111111' })
    expect(out.customer).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('rejects a relation definition without a protected target type', () => {
    const unsafeDefs: ValidatorFieldDef[] = [
      { key: 'name', field_type: 'text', options: [], relation_target: null, is_required: true },
      { key: 'customer', field_type: 'relation', options: [], relation_target: null, is_required: false }
    ]
    expect(() => validateRecord(unsafeDefs, {
      name: 'Widget',
      customer: '11111111-1111-1111-1111-111111111111'
    })).toThrow(/protected target/)
  })
})
