import { describe, expect, it, vi } from 'vitest'
import {
  decodeCatalogCursor,
  encodeCatalogCursor,
  listCatalogGovernance,
  type CatalogGovernanceReadDb
} from '~~/server/utils/ai/governance/catalogGovernanceRead'

const DEPARTMENT_ID = '10000000-0000-4000-8000-000000000001'
const OWNER_ID = '20000000-0000-4000-8000-000000000001'

function row(index: number, overrides: Record<string, unknown> = {}) {
  return {
    kind: index % 2 === 0 ? 'capability' : 'pack',
    release_id: `30000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    entity_id: `40000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    entity_key: index % 2 === 0 ? `capability_${index}` : `pack_${index}`,
    entity_name: `Catalog entity ${index}`,
    entity_description: 'Governed test entity',
    department_id: DEPARTMENT_ID,
    department_name: 'Marketing',
    department_slug: 'marketing',
    owner_user_id: OWNER_ID,
    owner_name: 'Department Owner',
    version_id: `50000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    version: index + 1,
    version_label: index % 2 === 0 ? null : `Pack v${index + 1}`,
    release_state: 'pilot',
    evaluation_run_id: `60000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    evaluation_gate_passed: true,
    evaluation_run_status: 'completed',
    eval_case_count: 10,
    eval_passed_count: 10,
    eval_failed_count: 0,
    eval_human_review_count: 0,
    model_feature_key: 'assistant_default',
    required_permission_group: index % 2 === 0 ? 'MEDIA_BUYING' : null,
    risk_class: index % 2 === 0 ? 'medium' : null,
    data_class: index % 2 === 0 ? 'confidential' : null,
    approval_mode: index % 2 === 0 ? 'confirm' : null,
    max_input_tokens: 6000,
    max_output_tokens: 900,
    max_cost_usd_micros: '80000',
    max_latency_ms: 12000,
    capability_count: index % 2 === 0 ? 1 : 3,
    tool_count: index % 2 === 0 ? 2 : 7,
    tool_names: ['get_budget_health', 'search_knowledge'],
    change_reason: 'Pilot approved',
    changed_by: OWNER_ID,
    created_at: `2026-07-21T08:00:${(59 - index).toString().padStart(2, '0')}.000Z`,
    updated_at: `2026-07-21T08:05:${(59 - index).toString().padStart(2, '0')}.000Z`,
    ...overrides
  }
}

describe('catalog governance cursor', () => {
  it('round-trips a bounded opaque cursor', () => {
    const value = {
      createdAt: '2026-07-21T08:00:00.000Z',
      kind: 'capability' as const,
      releaseId: '30000000-0000-4000-8000-000000000001'
    }

    expect(decodeCatalogCursor(encodeCatalogCursor(value))).toEqual(value)
  })

  it.each(['', 'not-base64!', 'e30', 'a'.repeat(513)])('rejects malformed cursors', (value) => {
    expect(() => decodeCatalogCursor(value)).toThrow('Invalid catalog cursor')
  })
})

describe('listCatalogGovernance', () => {
  it('uses parameterized filters and returns a typed governance inventory', async () => {
    const queryRows = vi.fn().mockResolvedValue([row(0)])
    const db: CatalogGovernanceReadDb = { queryRows }

    const result = await listCatalogGovernance({
      departmentId: DEPARTMENT_ID,
      kind: 'capability',
      releaseState: 'pilot',
      limit: 25,
      cursor: null
    }, db)

    expect(result).toEqual({
      items: [expect.objectContaining({
        kind: 'capability',
        key: 'capability_0',
        department: { id: DEPARTMENT_ID, name: 'Marketing', slug: 'marketing' },
        owner: { id: OWNER_ID, name: 'Department Owner' },
        release: expect.objectContaining({ state: 'pilot', evaluationGatePassed: true }),
        evaluation: {
          runId: '60000000-0000-4000-8000-000000000000',
          status: 'completed',
          gatePassed: true,
          caseCount: 10,
          passedCount: 10,
          failedCount: 0,
          humanReviewCount: 0
        },
        controls: expect.objectContaining({
          permissionGroup: 'MEDIA_BUYING',
          toolCount: 2,
          toolNames: ['get_budget_health', 'search_knowledge'],
          toolsTruncated: false,
          maxCostUsdMicros: 80000
        })
      })],
      nextCursor: null
    })

    const [sql, params] = queryRows.mock.calls[0]!
    expect(params).toEqual([DEPARTMENT_ID, 'capability', 'pilot', null, null, null, 26])
    expect(sql).toContain('$1::uuid')
    expect(sql).toContain('$2::text')
    expect(sql).toContain('$3::text')
    expect(sql).toContain('LIMIT $7')
    expect(sql).toContain('ai_capability_releases')
    expect(sql).toContain('ai_pack_releases')
    expect(sql).not.toMatch(/raw_output|system_prompt|scope_fixture|\binput\b/i)
  })

  it('returns a stable cursor and removes the look-ahead row', async () => {
    const queryRows = vi.fn().mockResolvedValue([row(0), row(1), row(2)])
    const db: CatalogGovernanceReadDb = { queryRows }

    const result = await listCatalogGovernance({ limit: 2 }, db)

    expect(result.items).toHaveLength(2)
    expect(decodeCatalogCursor(result.nextCursor as string)).toEqual({
      createdAt: row(1).created_at,
      kind: 'pack',
      releaseId: row(1).release_id
    })
  })

  it('applies the decoded cursor and rejects unbounded requests', async () => {
    const queryRows = vi.fn().mockResolvedValue([])
    const db: CatalogGovernanceReadDb = { queryRows }
    const cursor = encodeCatalogCursor({
      createdAt: '2026-07-21T08:00:00.000Z',
      kind: 'pack',
      releaseId: '30000000-0000-4000-8000-000000000001'
    })

    await expect(listCatalogGovernance({ limit: 10, cursor }, db)).resolves.toEqual({
      items: [],
      nextCursor: null
    })
    expect(queryRows.mock.calls[0]![1]).toEqual([
      null,
      null,
      null,
      '2026-07-21T08:00:00.000Z',
      'pack',
      '30000000-0000-4000-8000-000000000001',
      11
    ])

    await expect(listCatalogGovernance({ limit: 101 }, db)).rejects.toThrow('between 1 and 100')
  })
})
