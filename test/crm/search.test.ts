import { describe, expect, it, vi } from 'vitest'
import {
  buildSearchQuery,
  runCrmKeywordSearch,
  SEARCH_ENTITIES
} from '~~/server/utils/crm/search'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'

const CLIENT = '11111111-1111-4111-8111-111111111111'
const ACTOR = '22222222-2222-4222-8222-222222222222'

const context = (ownerScoped = false): CrmSearchContext => ({
  organisationScopeId: '33333333-3333-4333-8333-333333333333',
  clientId: CLIENT,
  correlationId: '44444444-4444-4444-8444-444444444444',
  actorType: 'staff',
  actorId: ACTOR,
  surface: 'agency_global',
  permissionSet: ['CLIENTS'],
  visibility: { ownerScoped }
})

describe('buildSearchQuery', () => {
  it('returns null for a blank normalized term', () => {
    expect(buildSearchQuery(context(), '')).toBeNull()
    expect(buildSearchQuery(context(), '   ')).toBeNull()
  })

  it('parameterises the normalized term and context-owned client', () => {
    const out = buildSearchQuery(context(), 'acme deal', 50)!
    expect(out.params).toEqual(['acme deal', CLIENT, 50])
    expect(out.sql).not.toContain('acme deal')
    expect(out.sql).toContain('$1')
    expect(out.sql).toContain('$2')
    expect(out.sql).toContain('$3')
  })

  it('searches every keyword entity inside the canonical client and deletion boundary', () => {
    const { sql } = buildSearchQuery(context(), 'acme', 50)!
    for (const type of ['person', 'company', 'opportunity', 'activity', 'task']) {
      expect(sql).toContain(`'${type}'`)
    }
    expect(sql).toContain('websearch_to_tsquery')
    expect(sql).toContain('UNION ALL')
    expect((sql.match(/client_id = \$2/g) || [])).toHaveLength(SEARCH_ENTITIES.length)
    expect((sql.match(/deleted_at IS NULL/g) || [])).toHaveLength(SEARCH_ENTITIES.length)
  })

  it('applies the entity-specific owner visibility predicates from the canonical context', () => {
    const { sql, params } = buildSearchQuery(context(true), 'acme', 50)!
    expect(sql).toContain('(person.owner_id = $4 OR person.assigned_to = $5)')
    expect(sql).toContain('(company.owner_id = $6 OR company.assigned_to = $7)')
    expect(sql).toContain('(opportunity.owner_id = $8 OR opportunity.assigned_to = $9)')
    expect(sql).toContain(`activity.target_type = 'person'`)
    expect(sql).toContain('task.assigned_to')
    expect(params.slice(3)).toEqual(new Array(params.length - 3).fill(ACTOR))
  })

  it('uses the stable keyword pool and deterministic total ordering', () => {
    const { sql, params } = buildSearchQuery(context(), 'acme', 999)!
    expect(params[2]).toBe(50)
    expect(sql).toMatch(/ORDER BY rank DESC, title ASC, type ASC, id ASC LIMIT \$3/)
  })

  it('mirrors the indexed tsvectors', () => {
    const { sql } = buildSearchQuery(context(), 'acme', 50)!
    expect(sql).toContain(`COALESCE(first_name,'')`)
    expect(sql).toContain(`COALESCE(job_title,'')`)
    expect(sql).toContain(`COALESCE(name,'')`)
  })
})

describe('runCrmKeywordSearch', () => {
  it('returns the existing public hit shape from authoritative keyword rows', async () => {
    const queryRows = vi.fn().mockResolvedValue([
      { type: 'company', id: 'company-1', title: '', subtitle: null, rank: '0.75' }
    ])

    await expect(runCrmKeywordSearch(context(), 'Acme', 50, { queryRows })).resolves.toEqual([
      { type: 'company', id: 'company-1', title: '(untitled)', subtitle: null, rank: 0.75 }
    ])
  })
})
