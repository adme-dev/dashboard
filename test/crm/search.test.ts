import { describe, it, expect } from 'vitest'
import { buildSearchQuery, SEARCH_ENTITIES } from '~~/server/utils/crm/search'

const CLIENT = '11111111-1111-4111-8111-111111111111'

describe('buildSearchQuery', () => {
  it('returns null for a blank or whitespace term', () => {
    expect(buildSearchQuery(CLIENT, '')).toBeNull()
    expect(buildSearchQuery(CLIENT, '   ')).toBeNull()
    expect(buildSearchQuery(CLIENT, '\t\n')).toBeNull()
  })

  it('parameterises the term, client and limit (no interpolation)', () => {
    const out = buildSearchQuery(CLIENT, 'acme deal', 25)!
    expect(out).not.toBeNull()
    // term, clientId, limit — in that order.
    expect(out.params).toEqual(['acme deal', CLIENT, 25])
    // The raw term must never be inlined into the SQL string.
    expect(out.sql).not.toContain('acme deal')
    expect(out.sql).toContain('$1')
    expect(out.sql).toContain('$2')
    expect(out.sql).toContain('$3')
  })

  it('searches all five CRM entities via websearch_to_tsquery', () => {
    const { sql } = buildSearchQuery(CLIENT, 'acme')!
    for (const t of ['person', 'company', 'opportunity', 'activity', 'task']) {
      expect(sql).toContain(`'${t}'`)
    }
    expect(sql).toContain('websearch_to_tsquery')
    expect(sql).toContain('UNION ALL')
    // Every branch is client-scoped + soft-delete aware.
    expect((sql.match(/client_id = \$2/g) || []).length).toBe(SEARCH_ENTITIES.length)
    expect((sql.match(/deleted_at IS NULL/g) || []).length).toBe(SEARCH_ENTITIES.length)
  })

  it('ranks results and bounds the result set', () => {
    const { sql } = buildSearchQuery(CLIENT, 'acme')!
    expect(sql).toContain('ts_rank')
    expect(sql).toMatch(/ORDER BY\s+rank DESC/i)
    expect(sql).toContain('LIMIT $3')
  })

  it('defaults the limit and clamps it to a sane maximum', () => {
    expect(buildSearchQuery(CLIENT, 'x')!.params[2]).toBe(20)
    expect(buildSearchQuery(CLIENT, 'x', 9999)!.params[2]).toBe(50)
    expect(buildSearchQuery(CLIENT, 'x', 0)!.params[2]).toBe(1)
  })

  it('mirrors each index tsvector so the GIN indexes are usable', () => {
    const { sql } = buildSearchQuery(CLIENT, 'acme')!
    // person vector must include the same columns indexed in migration 152.
    expect(sql).toContain("COALESCE(first_name,'')")
    expect(sql).toContain("COALESCE(job_title,'')")
    expect(sql).toContain("COALESCE(name,'')")
  })
})
