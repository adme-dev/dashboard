import { describe, it, expect } from 'vitest'
import { buildFilterConds, parseFilters, FILTER_FIELDS } from '~~/server/utils/crm/filters'

describe('parseFilters', () => {
  it('parses a JSON string, passes arrays through, and never throws', () => {
    expect(parseFilters('[{"field":"city","op":"eq","value":"Perth"}]')).toEqual([{ field: 'city', op: 'eq', value: 'Perth' }])
    expect(parseFilters([{ field: 'x', op: 'eq' }])).toEqual([{ field: 'x', op: 'eq' }])
    expect(parseFilters('not json')).toEqual([])
    expect(parseFilters('{"not":"array"}')).toEqual([])
    expect(parseFilters(undefined)).toEqual([])
  })
})

describe('buildFilterConds — alias', () => {
  it('prefixes columns for joined queries', () => {
    const [c] = buildFilterConds('opportunities', [{ field: 'status', op: 'eq', value: 'won' }], 'o')
    expect(c.sql).toBe('o.status = ?')
    const [arr] = buildFilterConds('people', [{ field: 'tags', op: 'has', value: 'vip' }], 'p')
    expect(arr.sql).toBe('? = ANY(p.tags)')
  })
})

describe('buildFilterConds — whitelisting', () => {
  it('ignores unknown fields (no column injection)', () => {
    const conds = buildFilterConds('people', [
      { field: 'first_name; DROP TABLE crm_people', op: 'eq', value: 'x' },
      { field: 'not_a_field', op: 'eq', value: 'y' },
    ])
    expect(conds).toEqual([])
  })

  it('rejects an operator not allowed for the field type', () => {
    // lifecycle_stage is an enum — `contains` (text-only) is not allowed.
    const conds = buildFilterConds('people', [{ field: 'lifecycle_stage', op: 'contains', value: 'lead' }])
    expect(conds).toEqual([])
  })

  it('only exposes documented fields per entity', () => {
    expect(Object.keys(FILTER_FIELDS.people)).toContain('lifecycle_stage')
    expect(Object.keys(FILTER_FIELDS.opportunities)).toContain('stage_id')
    expect(FILTER_FIELDS.opportunities).not.toHaveProperty('tags') // opps have no tags column
  })
})

describe('buildFilterConds — operators', () => {
  it('eq → parameterised equality', () => {
    const [c] = buildFilterConds('people', [{ field: 'lifecycle_stage', op: 'eq', value: 'lead' }])
    expect(c.sql).toBe('lifecycle_stage = ?')
    expect(c.params).toEqual(['lead'])
  })

  it('contains → escaped ILIKE wildcards', () => {
    const [c] = buildFilterConds('people', [{ field: 'email', op: 'contains', value: '50%_off' }])
    expect(c.sql).toBe('email ILIKE ?')
    expect(c.params).toEqual(['%50\\%\\_off%'])
  })

  it('in → ANY over an array param', () => {
    const [c] = buildFilterConds('opportunities', [{ field: 'status', op: 'in', value: ['open', 'won'] }])
    expect(c.sql).toBe('status = ANY(?)')
    expect(c.params).toEqual([['open', 'won']])
  })

  it('has → array membership (value = ANY(column))', () => {
    const [c] = buildFilterConds('people', [{ field: 'tags', op: 'has', value: 'vip' }])
    expect(c.sql).toBe('? = ANY(tags)')
    expect(c.params).toEqual(['vip'])
  })

  it('is_empty / not_empty produce no params and handle text vs array vs uuid', () => {
    const [text] = buildFilterConds('people', [{ field: 'email', op: 'is_empty', value: null }])
    expect(text.sql).toBe("(email IS NULL OR email = '')")
    expect(text.params).toEqual([])
    const [arr] = buildFilterConds('people', [{ field: 'tags', op: 'not_empty', value: null }])
    expect(arr.sql).toBe('(tags IS NOT NULL AND cardinality(tags) > 0)')
    const [uuid] = buildFilterConds('people', [{ field: 'owner_id', op: 'is_empty', value: null }])
    expect(uuid.sql).toBe('owner_id IS NULL')
  })

  it('numeric comparators on opportunity amount', () => {
    const [c] = buildFilterConds('opportunities', [{ field: 'amount', op: 'gte', value: 5000 }])
    expect(c.sql).toBe('amount >= ?')
    expect(c.params).toEqual([5000])
  })

  it('drops clauses with the wrong value shape (in needs an array)', () => {
    expect(buildFilterConds('opportunities', [{ field: 'status', op: 'in', value: 'open' }])).toEqual([])
    expect(buildFilterConds('people', [{ field: 'amount' as any, op: 'gte', value: 'x' }])).toEqual([])
  })

  it('combines multiple clauses in order', () => {
    const conds = buildFilterConds('people', [
      { field: 'lifecycle_stage', op: 'eq', value: 'customer' },
      { field: 'tags', op: 'has', value: 'vip' },
    ])
    expect(conds.map(c => c.sql)).toEqual(['lifecycle_stage = ?', '? = ANY(tags)'])
  })
})
