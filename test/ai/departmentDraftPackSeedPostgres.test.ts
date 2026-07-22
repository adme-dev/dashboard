import { describe, expect, it, vi } from 'vitest'
import { seedDepartmentDraftPack } from '~~/server/utils/ai/governance/departmentDraftPackSeeder'
import {
  createPostgresDepartmentDraftPackSeedTransaction,
  type DepartmentDraftPackSeedSqlClient
} from '~~/server/utils/ai/governance/departmentDraftPackSeedPostgres'

const DEPARTMENT_ID = '10000000-0000-4000-8000-000000000001'
const OWNER_ID = '20000000-0000-4000-8000-000000000001'
const ACTOR_ID = '30000000-0000-4000-8000-000000000001'

describe('department draft pack Postgres adapter', () => {
  it('seeds the full draft graph with parameterized SQL and database-generated identities', async () => {
    let sequence = 0
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM departments department')) {
        return { rows: [{
          department_id: DEPARTMENT_ID,
          department_name: 'Creative',
          department_slug: 'creative',
          department_kind: 'organizational',
          department_is_active: true,
          owner_id: OWNER_ID,
          owner_name: 'Creative Manager',
          owner_is_active: true,
          owner_is_department_member: true
        }] }
      }
      if (sql.includes('FROM ai_capability_packs pack')) return { rows: [] }
      if (/RETURNING id/.test(sql)) {
        sequence += 1
        return { rows: [{ id: `40000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}` }] }
      }
      return { rows: [] }
    })
    const client: DepartmentDraftPackSeedSqlClient = { query }
    const transaction = createPostgresDepartmentDraftPackSeedTransaction(client)

    const result = await seedDepartmentDraftPack({
      blueprintKey: 'creative',
      departmentId: DEPARTMENT_ID,
      ownerUserId: OWNER_ID,
      actorUserId: ACTOR_ID,
      reason: 'Owner confirmed for the first read/draft evaluation cycle.'
    }, { transaction: callback => callback(transaction) })

    expect(result).toMatchObject({ outcome: 'created', releaseState: 'draft', capabilityCount: 2, evaluationCaseCount: 3 })
    expect(query.mock.calls.some(([sql]) => String(sql).includes('pg_advisory_xact_lock'))).toBe(true)
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO ai_eval_cases'))).toBe(true)
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO ai_capability_tool_bindings'))).toBe(true)
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO ai_pack_releases'))).toBe(true)
    expect(query.mock.calls.every(([sql, params]) => !String(sql).includes('Owner confirmed') && Array.isArray(params))).toBe(true)
    const capabilityVersionCall = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO ai_capability_versions'))
    expect(capabilityVersionCall?.[1]).toContain('AUTHENTICATED')
  })

  it('maps an existing draft record for service-level idempotency checks', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM ai_capability_packs pack')) {
        return { rows: [{
          pack_id: '40000000-0000-4000-8000-000000000001',
          pack_version_id: '40000000-0000-4000-8000-000000000002',
          pack_release_id: '40000000-0000-4000-8000-000000000003',
          owner_user_id: OWNER_ID,
          version: '1',
          material_version_digest: 'a'.repeat(64),
          release_state: 'draft'
        }] }
      }
      return { rows: [] }
    })
    const transaction = createPostgresDepartmentDraftPackSeedTransaction({ query })

    await expect(transaction.findExistingPack(DEPARTMENT_ID, 'creative_read_draft')).resolves.toEqual({
      packId: '40000000-0000-4000-8000-000000000001',
      packVersionId: '40000000-0000-4000-8000-000000000002',
      packReleaseId: '40000000-0000-4000-8000-000000000003',
      ownerUserId: OWNER_ID,
      version: 1,
      materialDigest: 'a'.repeat(64),
      releaseState: 'draft'
    })
  })
})
