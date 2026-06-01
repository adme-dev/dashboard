import { describe, it, expect } from 'vitest'
import { diffFields } from '~~/server/utils/crm/audit'

describe('diffFields', () => {
  it('emits a change for each whitelisted field that changed', () => {
    const before = { name: 'Acme', city: 'Perth', phone: '111' }
    const after = { name: 'Acme Co', city: 'Perth', phone: '222' }
    const changes = diffFields(before, after, ['name', 'city', 'phone'])
    expect(changes).toEqual([
      { field: 'name', old_value: 'Acme', new_value: 'Acme Co' },
      { field: 'phone', old_value: '111', new_value: '222' },
    ])
  })

  it('only considers whitelisted fields (ignores others that changed)', () => {
    const before = { name: 'A', updated_at: 't1', secret: 1 }
    const after = { name: 'A', updated_at: 't2', secret: 2 }
    expect(diffFields(before, after, ['name'])).toEqual([])
  })

  it('treats null / undefined / empty-string as the same "empty" value', () => {
    expect(diffFields({ a: null }, { a: '' }, ['a'])).toEqual([])
    expect(diffFields({ a: undefined }, { a: null }, ['a'])).toEqual([])
    expect(diffFields({}, { a: '' }, ['a'])).toEqual([])
  })

  it('records a transition to/from empty', () => {
    expect(diffFields({ a: null }, { a: 'x' }, ['a'])).toEqual([
      { field: 'a', old_value: null, new_value: 'x' },
    ])
    expect(diffFields({ a: 'x' }, { a: null }, ['a'])).toEqual([
      { field: 'a', old_value: 'x', new_value: null },
    ])
  })

  it('stringifies non-string scalars and compares by value', () => {
    expect(diffFields({ n: 5 }, { n: 5 }, ['n'])).toEqual([])
    expect(diffFields({ n: 5 }, { n: 6 }, ['n'])).toEqual([
      { field: 'n', old_value: '5', new_value: '6' },
    ])
  })

  it('compares arrays/objects by their JSON form', () => {
    expect(diffFields({ tags: ['a', 'b'] }, { tags: ['a', 'b'] }, ['tags'])).toEqual([])
    expect(diffFields({ tags: ['a'] }, { tags: ['a', 'b'] }, ['tags'])).toEqual([
      { field: 'tags', old_value: '["a"]', new_value: '["a","b"]' },
    ])
  })
})
