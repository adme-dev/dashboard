import { describe, expect, it, vi } from 'vitest'
import {
  classifyLakebaseReadiness,
  inspectLakebaseCapability
} from '../../scripts/lakebase-pilot/capability'
import { runLakebasePreflight } from '../../scripts/lakebase-pilot/preflight'

const safeEnv = {
  LAKEBASE_PILOT_PROJECT_ID: 'pilot-green-river-12345678',
  LAKEBASE_PILOT_ENDPOINT_ID: 'ep-pilot-green-river-a1b2c3d4',
  LAKEBASE_PILOT_DATABASE_URL: 'postgresql://pilot:secret@ep-pilot-green-river-a1b2c3d4.ap-southeast-2.aws.neon.tech/app?sslmode=require',
  NEON_PRODUCTION_PROJECT_ID: 'prod-silent-tree-87654321',
  DATABASE_URL: 'postgresql://prod:secret@ep-prod-silent-tree-z9y8x7w6.ap-southeast-2.aws.neon.tech/app?sslmode=require'
}

function supportedQuery() {
  return vi.fn()
    .mockResolvedValueOnce([{ server_version_num: 160004, database_name: 'app' }])
    .mockResolvedValueOnce([{ shared_preload_libraries: 'pg_stat_statements,lakebase_text,lakebase_vector' }])
    .mockResolvedValueOnce([
      { name: 'lakebase_text', default_version: '0.1.0', installed_version: null },
      { name: 'lakebase_vector', default_version: '0.1.0', installed_version: null }
    ])
    .mockResolvedValueOnce([{ pilot_schema_exists: false }])
}

describe('Lakebase capability inspector', () => {
  it('passes only on PG16+ with both libraries preloaded and both extensions available', async () => {
    const query = supportedQuery()

    const report = await inspectLakebaseCapability(query)

    expect(classifyLakebaseReadiness(report)).toEqual({ ready: true, blockers: [] })
  })

  it('blocks Postgres versions earlier than 16', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ server_version_num: 150009, database_name: 'app' }])
      .mockResolvedValueOnce([{ shared_preload_libraries: 'lakebase_text,lakebase_vector' }])
      .mockResolvedValueOnce([
        { name: 'lakebase_text', default_version: '0.1.0', installed_version: null },
        { name: 'lakebase_vector', default_version: '0.1.0', installed_version: null }
      ])
      .mockResolvedValueOnce([{ pilot_schema_exists: false }])

    expect(classifyLakebaseReadiness(await inspectLakebaseCapability(query)).blockers)
      .toContain('postgres_16_required')
  })

  it('blocks when either preload library is absent', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ server_version_num: 160004, database_name: 'app' }])
      .mockResolvedValueOnce([{ shared_preload_libraries: 'lakebase_text' }])
      .mockResolvedValueOnce([
        { name: 'lakebase_text', default_version: '0.1.0', installed_version: null },
        { name: 'lakebase_vector', default_version: '0.1.0', installed_version: null }
      ])
      .mockResolvedValueOnce([{ pilot_schema_exists: false }])

    expect(classifyLakebaseReadiness(await inspectLakebaseCapability(query)).blockers)
      .toContain('lakebase_preloads_missing')
  })

  it('uses only read-only SQL statements', async () => {
    const query = supportedQuery()

    await inspectLakebaseCapability(query)

    for (const [sql] of query.mock.calls) {
      expect(sql.trim()).toMatch(/^(SELECT|SHOW|WITH)\b/i)
    }
  })

  it('returns a structured failure code without exposing a database error', async () => {
    const output: unknown[] = []
    const result = await runLakebasePreflight(
      { env: safeEnv },
      {
        createQuery: () => vi.fn().mockRejectedValue(new Error('password=top-secret database unavailable')),
        write: value => output.push(value)
      }
    )

    expect(result.exitCode).toBe(1)
    expect(output).toEqual([{ status: 'blocked', code: 'database_query_failed' }])
    expect(JSON.stringify(output)).not.toContain('top-secret')
  })
})
