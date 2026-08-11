import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import { createNeonPreviewDatabaseAdapter } from '../../scripts/crm-search/neon-preview-database-adapter.mjs'

const projectId = 'square-tooth-23821574'
const branchId = 'br-crm-search-preview-1234'
const sourceBranchId = 'br-small-hall-a4qtwjgo'
const endpoint = {
  id: 'ep-crm-search-preview-1234',
  branchId,
  host: 'ep-crm-search-preview-1234.ap-southeast-2.aws.neon.tech'
}
const migrationPaths = [
  'server/database/migrations/134-crm-core.sql',
  'server/database/migrations/135-crm-opportunities.sql',
  'server/database/migrations/350_crm_search_expand.sql',
  'server/database/migrations/351_crm_search_validate_backfill.sql',
  'server/database/migrations/352_crm_search_activate_capture.sql'
]
const migrationDigests = Object.fromEntries(migrationPaths.map(path => [
  path,
  createHash('sha256').update(readFileSync(new URL(`../../${path}`, import.meta.url))).digest('hex')
]))

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body }
}

function dependencies(overrides: Record<string, unknown> = {}) {
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(jsonResponse({ roles: [{ name: 'neondb_owner' }] }))
    .mockResolvedValueOnce(jsonResponse({
      databases: [{ name: 'neondb', owner_name: 'neondb_owner' }]
    }))
    .mockResolvedValueOnce(jsonResponse({
      uri: `postgresql://neondb_owner:ephemeral-password@${endpoint.host}/neondb?sslmode=require`
    }))
  const spawnSyncImpl = vi.fn()
    .mockReturnValueOnce({
      status: 0,
      stdout: 'crm_people,0\ncrm_companies,0\ncrm_opportunities,0\n',
      stderr: ''
    })
    .mockReturnValueOnce({ status: 0, stdout: 'ready\n', stderr: '' })
    .mockReturnValue({ status: 0, stdout: '', stderr: '' })
  return { fetchImpl, spawnSyncImpl, ...overrides }
}

describe('CRM search Neon preview database adapter', () => {
  it('copies only parent DDL in memory before applying preview prerequisites', async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      const source = input.includes(`/branches/${sourceBranchId}/`)
        || input.includes(`branch_id=${sourceBranchId}`)
      if (input.endsWith('/roles')) return jsonResponse({ roles: [{ name: 'neondb_owner' }] })
      if (input.endsWith('/databases')) {
        return jsonResponse({ databases: [{ name: 'neondb', owner_name: 'neondb_owner' }] })
      }
      return jsonResponse({
        uri: source
          ? 'postgresql://neondb_owner:source-password@ep-source-direct-1234.ap-southeast-2.aws.neon.tech/neondb?sslmode=require'
          : `postgresql://neondb_owner:target-password@${endpoint.host}/neondb?sslmode=require`
      })
    })
    const schemaSql = [
      '-- PostgreSQL database schema dump',
      'CREATE TABLE public.agency_clients (id uuid PRIMARY KEY);'
    ].join('\n')
    const spawnSyncImpl = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: schemaSql, stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: 'missing\n', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: 'ready\n', stderr: '' })
      .mockReturnValue({ status: 0, stdout: '', stderr: '' })
    const adapter = createNeonPreviewDatabaseAdapter({
      apiToken: 'oauth-access-token-not-logged',
      sourceBranchId,
      pgDumpCommand: '/opt/homebrew/opt/postgresql@17/bin/pg_dump',
      fetchImpl,
      spawnSyncImpl,
      sleep: vi.fn().mockResolvedValue(undefined),
      schemaPollAttempts: 1
    })

    await expect(adapter.applyPrerequisiteMigrations({
      projectId, branchId, sourceBranchId, endpoint,
      migrationPaths: migrationPaths.slice(0, 2), migrationDigests
    })).resolves.toEqual({
      ok: true,
      applied: migrationPaths.slice(0, 2),
      sourceSchemaProof: {
        method: 'pg_dump_schema_only',
        sourceBranchId,
        sha256: createHash('sha256').update(schemaSql).digest('hex')
      }
    })

    expect(spawnSyncImpl.mock.calls[0]?.[0]).toBe('/opt/homebrew/opt/postgresql@17/bin/pg_dump')
    expect(spawnSyncImpl.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([
      '--schema-only', '--no-owner', '--no-privileges'
    ]))
    expect(spawnSyncImpl.mock.calls[0]?.[2]?.env).toMatchObject({
      PGHOST: 'ep-source-direct-1234.ap-southeast-2.aws.neon.tech',
      PGPASSWORD: 'source-password'
    })
    expect(spawnSyncImpl.mock.calls[2]?.[0]).toBe('psql')
    expect(spawnSyncImpl.mock.calls[2]?.[1]).toContain('--single-transaction')
    expect(spawnSyncImpl.mock.calls[2]?.[2]).toMatchObject({
      input: schemaSql,
      env: expect.objectContaining({
        PGHOST: endpoint.host,
        PGPASSWORD: 'target-password'
      })
    })
    expect(spawnSyncImpl.mock.calls.flatMap(call => call[1] as string[]).join(' '))
      .not.toContain('source-password')

    const unsafeSpawn = vi.fn().mockReturnValue({
      status: 0,
      stdout: `${schemaSql}\nCOPY public.agency_clients (id) FROM stdin;\n`,
      stderr: ''
    })
    const unsafeAdapter = createNeonPreviewDatabaseAdapter({
      apiToken: 'oauth-access-token-not-logged',
      sourceBranchId,
      fetchImpl,
      spawnSyncImpl: unsafeSpawn
    })
    await expect(unsafeAdapter.applyPrerequisiteMigrations({
      projectId, branchId, sourceBranchId, endpoint,
      migrationPaths: migrationPaths.slice(0, 2), migrationDigests
    })).rejects.toThrow('crm_search_neon_parent_schema_dump_invalid')
    expect(unsafeSpawn).toHaveBeenCalledTimes(1)
  })

  it('waits for the copied parent schema before applying prerequisite migrations', async () => {
    const deps = dependencies()
    deps.spawnSyncImpl.mockReset()
      .mockReturnValueOnce({ status: 0, stdout: 'missing\n', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: 'ready\n', stderr: '' })
      .mockReturnValue({ status: 0, stdout: '', stderr: '' })
    const sleep = vi.fn().mockResolvedValue(undefined)
    const adapter = createNeonPreviewDatabaseAdapter({
      apiToken: 'oauth-access-token-not-logged',
      fetchImpl: deps.fetchImpl,
      spawnSyncImpl: deps.spawnSyncImpl,
      sleep,
      schemaPollAttempts: 3
    })

    await expect(adapter.applyPrerequisiteMigrations({
      projectId, branchId, endpoint,
      migrationPaths: migrationPaths.slice(0, 2), migrationDigests
    })).resolves.toEqual({ ok: true, applied: migrationPaths.slice(0, 2) })

    expect(deps.spawnSyncImpl).toHaveBeenCalledTimes(4)
    expect(deps.spawnSyncImpl.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([
      '-c', expect.stringContaining('to_regclass(\'public.agency_clients\')')
    ]))
    expect(deps.spawnSyncImpl.mock.calls[2]?.[1]).toEqual(expect.arrayContaining([
      '-f', expect.stringContaining('134-crm-core.sql')
    ]))
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('uses only the exact direct endpoint and proves every source table is empty', async () => {
    const deps = dependencies()
    const adapter = createNeonPreviewDatabaseAdapter({
      apiToken: 'oauth-access-token-not-logged',
      fetchImpl: deps.fetchImpl,
      spawnSyncImpl: deps.spawnSyncImpl,
      currentTime: () => Date.parse('2026-08-11T00:01:00.000Z')
    })

    await expect(adapter.assertEmpty({
      projectId,
      branchId,
      endpoint,
      organisationScopeId: '20000000-0000-4000-8000-000000000002',
      tables: ['crm_people', 'crm_companies', 'crm_opportunities']
    })).resolves.toEqual({
      organisationScopeId: '20000000-0000-4000-8000-000000000002',
      checkedAt: '2026-08-11T00:01:00.000Z',
      tables: { crm_people: 0, crm_companies: 0, crm_opportunities: 0 }
    })

    const [command, args, options] = deps.spawnSyncImpl.mock.calls[0]!
    expect(command).toBe('psql')
    expect(args.join(' ')).not.toContain('ephemeral-password')
    expect(options.env).toMatchObject({
      PGHOST: endpoint.host,
      PGDATABASE: 'neondb',
      PGUSER: 'neondb_owner',
      PGPASSWORD: 'ephemeral-password',
      PGSSLMODE: 'require'
    })
  })

  it('applies only exact-byte migrations and fails closed on data, pooled endpoints, or process errors', async () => {
    const deps = dependencies()
    const adapter = createNeonPreviewDatabaseAdapter({
      apiToken: 'oauth-access-token-not-logged',
      fetchImpl: deps.fetchImpl,
      spawnSyncImpl: deps.spawnSyncImpl,
      currentTime: () => Date.parse('2026-08-11T00:01:00.000Z')
    })
    await adapter.assertEmpty({
      projectId, branchId, endpoint,
      organisationScopeId: '20000000-0000-4000-8000-000000000002',
      tables: ['crm_people', 'crm_companies', 'crm_opportunities']
    })
    await expect(adapter.applyPrerequisiteMigrations({
      projectId, branchId, endpoint,
      migrationPaths: migrationPaths.slice(0, 2), migrationDigests
    })).resolves.toEqual({ ok: true, applied: migrationPaths.slice(0, 2) })
    await expect(adapter.applyMigrations({
      projectId, branchId, endpoint,
      migrationPaths: migrationPaths.slice(2), migrationDigests
    })).resolves.toEqual({ ok: true, applied: migrationPaths.slice(2) })
    expect(deps.spawnSyncImpl).toHaveBeenCalledTimes(7)

    const dataDeps = dependencies()
    dataDeps.spawnSyncImpl.mockReset().mockReturnValue({
      status: 0,
      stdout: 'crm_people,1\ncrm_companies,0\ncrm_opportunities,0\n',
      stderr: ''
    })
    const dataAdapter = createNeonPreviewDatabaseAdapter({
      apiToken: 'oauth-access-token-not-logged',
      fetchImpl: dataDeps.fetchImpl,
      spawnSyncImpl: dataDeps.spawnSyncImpl
    })
    await expect(dataAdapter.assertEmpty({
      projectId, branchId, endpoint,
      organisationScopeId: '20000000-0000-4000-8000-000000000002',
      tables: ['crm_people', 'crm_companies', 'crm_opportunities']
    })).rejects.toThrow('crm_search_neon_source_not_empty')

    const pooledDeps = dependencies()
    pooledDeps.fetchImpl.mockReset()
      .mockResolvedValueOnce(jsonResponse({ roles: [{ name: 'neondb_owner' }] }))
      .mockResolvedValueOnce(jsonResponse({ databases: [{ name: 'neondb', owner_name: 'neondb_owner' }] }))
      .mockResolvedValueOnce(jsonResponse({
        uri: 'postgresql://neondb_owner:password@ep-crm-search-preview-1234-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require'
      }))
    const pooledAdapter = createNeonPreviewDatabaseAdapter({
      apiToken: 'oauth-access-token-not-logged',
      fetchImpl: pooledDeps.fetchImpl,
      spawnSyncImpl: pooledDeps.spawnSyncImpl
    })
    await expect(pooledAdapter.assertEmpty({
      projectId, branchId, endpoint,
      organisationScopeId: '20000000-0000-4000-8000-000000000002',
      tables: ['crm_people', 'crm_companies', 'crm_opportunities']
    })).rejects.toThrow('crm_search_neon_connection_invalid')

    const processDeps = dependencies()
    processDeps.spawnSyncImpl.mockReset().mockReturnValue({
      status: 1, stdout: '', stderr: 'provider details must stay private'
    })
    const processAdapter = createNeonPreviewDatabaseAdapter({
      apiToken: 'oauth-access-token-not-logged',
      fetchImpl: processDeps.fetchImpl,
      spawnSyncImpl: processDeps.spawnSyncImpl
    })
    await expect(processAdapter.assertEmpty({
      projectId, branchId, endpoint,
      organisationScopeId: '20000000-0000-4000-8000-000000000002',
      tables: ['crm_people', 'crm_companies', 'crm_opportunities']
    })).rejects.toThrow('crm_search_neon_psql_failed')
  })
})
