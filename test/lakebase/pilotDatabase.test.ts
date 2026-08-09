import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPilotDatabase } from '../../scripts/lakebase-pilot/database'
import { loadFixtureRows, runPilotSetup, runPilotSetupCli } from '../../scripts/lakebase-pilot/setup'
import { runPilotTeardown, runPilotTeardownCli } from '../../scripts/lakebase-pilot/teardown'

const pg = vi.hoisted(() => ({
  connect: vi.fn(),
  end: vi.fn(),
  query: vi.fn()
}))

vi.mock('pg', () => ({
  Client: vi.fn(function (this: unknown, options: unknown) {
    return { ...pg, options }
  })
}))

const root = fileURLToPath(new URL('../..', import.meta.url))
const sqlPath = (name: string) => `${root}/scripts/lakebase-pilot/sql/${name}`
const fixturePath = `${root}/test/fixtures/lakebase-crm-search.json`

const safeEnv = {
  LAKEBASE_PILOT_PROJECT_ID: 'pilot-green-river-12345678',
  LAKEBASE_PILOT_ENDPOINT_ID: 'ep-pilot-green-river-a1b2c3d4',
  LAKEBASE_PILOT_DATABASE_URL: 'postgresql://pilot:secret@ep-pilot-green-river-a1b2c3d4.ap-southeast-2.aws.neon.tech/app?sslmode=require',
  NEON_PRODUCTION_PROJECT_ID: 'prod-silent-tree-87654321',
  DATABASE_URL: 'postgresql://prod:secret@ep-prod-silent-tree-z9y8x7w6.ap-southeast-2.aws.neon.tech/app?sslmode=require',
  LAKEBASE_PILOT_CONFIRM_NON_PRODUCTION_PROJECT: '1'
}

const indexNames = [
  'crm_search_documents_client_idx',
  'crm_search_documents_gin_idx',
  'crm_search_documents_bm25_idx'
]

async function loadFixture() {
  return JSON.parse(await readFile(fixturePath, 'utf8'))
}

describe('Lakebase pilot SQL and synthetic corpus', () => {
  it('creates only the pilot CRM table with tenant, entity, search, hash, and timestamp constraints', async () => {
    const sql = await readFile(sqlPath('schema.sql'), 'utf8')

    expect(sql.match(/CREATE EXTENSION/gi)).toHaveLength(2)
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS lakebase_vector CASCADE;')
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS lakebase_text CASCADE;')
    expect(sql.match(/CREATE SCHEMA/gi)).toHaveLength(1)
    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS lakebase_pilot;')
    expect(sql.match(/CREATE TABLE/gi)).toHaveLength(1)
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS lakebase_pilot.crm_search_documents')
    expect(sql).toContain('client_id UUID NOT NULL')
    expect(sql).toContain(`entity_type TEXT NOT NULL CHECK (entity_type IN ('person','company','opportunity','activity','task'))`)
    expect(sql).toContain('PRIMARY KEY (client_id, entity_type, entity_id)')
    expect(sql).toMatch(/search_vector TSVECTOR GENERATED ALWAYS AS[\s\S]+STORED/)
    expect(sql).toContain('content_hash TEXT NOT NULL')
    expect(sql).toContain('source_updated_at TIMESTAMPTZ')
    expect(sql).toContain('indexed_at TIMESTAMPTZ NOT NULL DEFAULT now()')
  })

  it('rebuilds exactly the three named pilot indexes with tenant, GIN, and BM25 access methods', async () => {
    const sql = await readFile(sqlPath('indexes.sql'), 'utf8')
    const dropped = [...sql.matchAll(/DROP INDEX IF EXISTS\s+([^;]+);/gi)].map(match => match[1])
    const created = [...sql.matchAll(/CREATE INDEX\s+(\S+)/gi)].map(match => match[1])

    expect(dropped).toEqual(indexNames.map(name => `lakebase_pilot.${name}`))
    expect(created).toEqual(indexNames)
    expect(sql).toContain('ON lakebase_pilot.crm_search_documents (client_id)')
    expect(sql).toContain('USING gin (search_vector)')
    expect(sql).toContain('USING lakebase_bm25 (search_vector)')
    expect(sql).toContain('WITH (default_limit = 50, prefilter = true)')
  })

  it('tears down exactly the pilot schema', async () => {
    const sql = await readFile(sqlPath('teardown.sql'), 'utf8')

    expect(sql).toBe('DROP SCHEMA IF EXISTS lakebase_pilot CASCADE;\n')
  })

  it('contains two synthetic tenants, overlapping text, and all five CRM entity types', async () => {
    const fixture = await loadFixture()
    const clientIds = new Set(fixture.documents.map((document: { clientId: string }) => document.clientId))
    const entityTypes = new Set(fixture.documents.map((document: { type: string }) => document.type))

    expect(fixture.clients).toHaveLength(2)
    expect(clientIds).toEqual(new Set(fixture.clients.map((client: { id: string }) => client.id)))
    expect(entityTypes).toEqual(new Set(['person', 'company', 'opportunity', 'activity', 'task']))
    expect(fixture.documents.filter((document: { title: string }) => document.title === 'Jordan Lee')).toHaveLength(2)
    expect(JSON.stringify(fixture)).not.toMatch(/@(?!harbour\.example|summit\.example)/)
    expect(JSON.stringify(fixture)).not.toMatch(/\.(com|com\.au|net|org|io)\b/i)
  })

  it('keeps every relevance judgement inside its tenant and excludes soft-deleted records', async () => {
    const fixture = await loadFixture()
    const documentsById = new Map(fixture.documents.map((document: { id: string }) => [document.id, document]))

    for (const query of fixture.queries) {
      for (const relevantId of query.relevantIds) {
        const document = documentsById.get(relevantId) as { clientId: string, deleted: boolean } | undefined
        expect(document, `${query.id} references a missing document`).toBeDefined()
        expect(document?.clientId, `${query.id} crosses tenant boundaries`).toBe(query.clientId)
        expect(document?.deleted, `${query.id} references a deleted document`).toBe(false)
      }
    }
  })

  it('omits deleted rows and produces deterministic SHA-256 content hashes', async () => {
    const fixture = await loadFixture()
    const rows = loadFixtureRows(fixture)
    const first = rows[0]
    const expectedHash = createHash('sha256')
      .update(JSON.stringify({
        clientId: '10000000-0000-4000-8000-000000000001',
        type: 'person',
        id: '11000000-0000-4000-8000-000000000001',
        title: 'Jordan Lee',
        subtitle: 'jordan@harbour.example',
        body: 'Fleet manager interested in electric demonstrator vehicles'
      }))
      .digest('hex')

    expect(rows).toHaveLength(7)
    expect(rows.map(row => row.id)).not.toContain('16000000-0000-4000-8000-000000000006')
    expect(first.contentHash).toBe(expectedHash)
    expect(first.contentHash).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('Lakebase pilot database adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pg.connect.mockResolvedValue(undefined)
    pg.end.mockResolvedValue(undefined)
  })

  it('connects pg.Client only to the explicit pilot URL and exposes row results', async () => {
    pg.query.mockResolvedValueOnce({ rows: [{ ok: true }] })

    const database = await createPilotDatabase({
      projectId: 'pilot-green-river-12345678',
      endpointId: 'ep-pilot-green-river-a1b2c3d4',
      databaseUrl: safeEnv.LAKEBASE_PILOT_DATABASE_URL,
      databaseHost: 'ep-pilot-green-river-a1b2c3d4.ap-southeast-2.aws.neon.tech',
      productionProjectId: safeEnv.NEON_PRODUCTION_PROJECT_ID
    })

    expect(Client).toHaveBeenCalledWith({
      connectionString: safeEnv.LAKEBASE_PILOT_DATABASE_URL
    })
    await expect(database.query('SELECT $1::int AS value', [1])).resolves.toEqual([{ ok: true }])
    await database.close()
    expect(pg.connect).toHaveBeenCalledOnce()
    expect(pg.end).toHaveBeenCalledOnce()
  })

  it('runs a transaction callback on one client and commits in order', async () => {
    pg.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ value: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
    const database = await createPilotDatabase({
      projectId: 'pilot-green-river-12345678',
      endpointId: 'ep-pilot-green-river-a1b2c3d4',
      databaseUrl: safeEnv.LAKEBASE_PILOT_DATABASE_URL,
      databaseHost: 'ep-pilot-green-river-a1b2c3d4.ap-southeast-2.aws.neon.tech',
      productionProjectId: safeEnv.NEON_PRODUCTION_PROJECT_ID
    })

    await expect(database.transaction(query => query('SELECT 1'))).resolves.toEqual([{ value: 1 }])
    expect(pg.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'SELECT 1', 'COMMIT'])
  })

  it.each(['callback', 'commit'])('attempts rollback and rethrows on %s failure', async (failurePoint) => {
    const originalError = new Error(`${failurePoint}_failed`)
    pg.query.mockImplementation(async (sql: string) => {
      if (failurePoint === 'commit' && sql === 'COMMIT') throw originalError
      return { rows: [] }
    })
    const database = await createPilotDatabase({
      projectId: 'pilot-green-river-12345678',
      endpointId: 'ep-pilot-green-river-a1b2c3d4',
      databaseUrl: safeEnv.LAKEBASE_PILOT_DATABASE_URL,
      databaseHost: 'ep-pilot-green-river-a1b2c3d4.ap-southeast-2.aws.neon.tech',
      productionProjectId: safeEnv.NEON_PRODUCTION_PROJECT_ID
    })

    const operation = database.transaction(async () => {
      if (failurePoint === 'callback') throw originalError
      return 'ok'
    })

    await expect(operation).rejects.toBe(originalError)
    expect(pg.query.mock.calls.map(([sql]) => sql)).toContain('ROLLBACK')
  })
})

describe('Lakebase pilot setup and teardown guards', () => {
  function readyRows(sql: string) {
    if (sql.includes('server_version_num')) return [{ server_version_num: 160004, database_name: 'app' }]
    if (sql.includes('shared_preload_libraries')) return [{ shared_preload_libraries: 'lakebase_text,lakebase_vector' }]
    if (sql.includes('pg_available_extensions')) {
      return [
        { name: 'lakebase_text', default_version: '0.1.0', installed_version: null },
        { name: 'lakebase_vector', default_version: '0.1.0', installed_version: null }
      ]
    }
    if (sql.includes('to_regnamespace')) return [{ pilot_schema_exists: false }]
    return []
  }

  it('resolves mutate safety before constructing a database client', async () => {
    const createDatabase = vi.fn()

    await expect(runPilotSetup({
      env: { ...safeEnv, LAKEBASE_PILOT_CONFIRM_NON_PRODUCTION_PROJECT: undefined },
      createDatabase
    })).rejects.toThrow('mutation_not_confirmed')
    expect(createDatabase).not.toHaveBeenCalled()
  })

  it.each([
    { command: 'setup', run: runPilotSetupCli },
    { command: 'teardown', run: runPilotTeardownCli }
  ])('returns a redacted non-zero $command CLI failure before any database connection', async ({ run }) => {
    vi.clearAllMocks()
    const output: unknown[] = []
    const secret = 'must-not-leak-from-cli'
    const result = await run({
      env: {
        NEON_API_KEY: secret,
        DATABASE_URL: `postgresql://production:${secret}@private.invalid/app`
      }
    }, {
      write: value => output.push(value)
    })

    expect(result).toEqual({
      exitCode: 1,
      output: { status: 'blocked', code: 'missing_lakebase_pilot_project_id' }
    })
    expect(output).toEqual([result.output])
    expect(JSON.stringify(output)).not.toContain(secret)
    expect(pg.connect).not.toHaveBeenCalled()
  })

  it('blocks schema creation until the capability is ready and closes the connection', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('server_version_num')) return [{ server_version_num: 150009, database_name: 'app' }]
      return readyRows(sql)
    })
    const close = vi.fn()

    await expect(runPilotSetup({
      env: safeEnv,
      createDatabase: vi.fn().mockResolvedValue({ query, transaction: vi.fn(), close })
    })).rejects.toMatchObject({ code: 'lakebase_capability_not_ready' })
    expect(query.mock.calls.some(([sql]) => sql.includes('CREATE SCHEMA'))).toBe(false)
    expect(close).toHaveBeenCalledOnce()
  })

  it('loads active rows with parameters, builds indexes after population, and vacuums after commit', async () => {
    const events: string[] = []
    const query = vi.fn(async (sql: string) => {
      events.push(sql.includes('VACUUM') ? 'vacuum' : 'capability')
      return readyRows(sql)
    })
    const transaction = vi.fn(async (callback: (query: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<void>) => {
      events.push('transaction:start')
      await callback(async (sql, params) => {
        if (sql.includes('CREATE TABLE')) events.push('schema')
        else if (sql.includes('TRUNCATE')) events.push('truncate')
        else if (sql.includes('INSERT INTO')) {
          events.push('insert')
          expect(sql).toContain('VALUES ($1, $2, $3, $4, $5, $6, $7)')
          expect(params).toHaveLength(7)
          expect(params?.[6]).toMatch(/^[a-f0-9]{64}$/)
        } else if (sql.includes('CREATE INDEX')) events.push('indexes')
        return []
      })
      events.push('transaction:commit')
    })
    const close = vi.fn()

    const result = await runPilotSetup({
      env: safeEnv,
      createDatabase: vi.fn().mockResolvedValue({ query, transaction, close })
    })

    expect(events.filter(event => event === 'insert')).toHaveLength(7)
    expect(events.indexOf('indexes')).toBeGreaterThan(events.lastIndexOf('insert'))
    expect(events.indexOf('vacuum')).toBeGreaterThan(events.indexOf('transaction:commit'))
    expect(result).toEqual({
      target: {
        projectId: safeEnv.LAKEBASE_PILOT_PROJECT_ID,
        endpointId: safeEnv.LAKEBASE_PILOT_ENDPOINT_ID,
        databaseHost: 'ep-pilot-green-river-a1b2c3d4.ap-southeast-2.aws.neon.tech'
      },
      fixtureCount: 8,
      insertedCount: 7,
      skippedDeletedCount: 1,
      indexes: indexNames
    })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(close).toHaveBeenCalledOnce()
  })

  it('resolves teardown mutation safety before construction and executes only checked-in teardown SQL', async () => {
    const createDatabase = vi.fn()
    await expect(runPilotTeardown({
      env: { ...safeEnv, LAKEBASE_PILOT_CONFIRM_NON_PRODUCTION_PROJECT: undefined },
      createDatabase
    })).rejects.toThrow('mutation_not_confirmed')
    expect(createDatabase).not.toHaveBeenCalled()

    const query = vi.fn().mockResolvedValue([])
    const close = vi.fn()
    const result = await runPilotTeardown({
      env: safeEnv,
      createDatabase: vi.fn().mockResolvedValue({ query, transaction: vi.fn(), close })
    })

    expect(query).toHaveBeenCalledWith('DROP SCHEMA IF EXISTS lakebase_pilot CASCADE;\n')
    expect(query).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    expect(result).toEqual({
      target: {
        projectId: safeEnv.LAKEBASE_PILOT_PROJECT_ID,
        endpointId: safeEnv.LAKEBASE_PILOT_ENDPOINT_ID,
        databaseHost: 'ep-pilot-green-river-a1b2c3d4.ap-southeast-2.aws.neon.tech'
      },
      droppedSchema: 'lakebase_pilot'
    })
  })

  it.each([
    {
      entryPath: 'setup',
      run: (database: { query: ReturnType<typeof vi.fn>, transaction: ReturnType<typeof vi.fn>, close: ReturnType<typeof vi.fn> }) => runPilotSetup({
        env: safeEnv,
        createDatabase: vi.fn().mockResolvedValue(database)
      })
    },
    {
      entryPath: 'teardown',
      run: (database: { query: ReturnType<typeof vi.fn>, transaction: ReturnType<typeof vi.fn>, close: ReturnType<typeof vi.fn> }) => runPilotTeardown({
        env: safeEnv,
        createDatabase: vi.fn().mockResolvedValue(database)
      })
    }
  ])('preserves the primary $entryPath error and attaches a separate coded close failure', async ({ run }) => {
    const operationError = new Error('operation_failed') as Error & {
      cleanupFailure?: { code: string, operationCompleted: boolean, cause: unknown }
    }
    const closeError = new Error('close_failed')
    const database = {
      query: vi.fn().mockRejectedValue(operationError),
      transaction: vi.fn(),
      close: vi.fn().mockRejectedValue(closeError)
    }

    await expect(run(database)).rejects.toBe(operationError)
    expect(operationError.cleanupFailure).toMatchObject({
      code: 'lakebase_database_close_failed',
      operationCompleted: false,
      cause: closeError
    })
  })

  it.each([
    {
      entryPath: 'setup',
      run: () => {
        const database = {
          query: vi.fn(async (sql: string) => readyRows(sql)),
          transaction: vi.fn().mockResolvedValue(undefined),
          close: vi.fn().mockRejectedValue(new Error('close_failed'))
        }
        return runPilotSetup({
          env: safeEnv,
          createDatabase: vi.fn().mockResolvedValue(database)
        })
      }
    },
    {
      entryPath: 'teardown',
      run: () => {
        const database = {
          query: vi.fn().mockResolvedValue([]),
          transaction: vi.fn(),
          close: vi.fn().mockRejectedValue(new Error('close_failed'))
        }
        return runPilotTeardown({
          env: safeEnv,
          createDatabase: vi.fn().mockResolvedValue(database)
        })
      }
    }
  ])('reports a coded $entryPath cleanup failure after the mutation completed', async ({ run }) => {
    await expect(run()).rejects.toMatchObject({
      code: 'lakebase_database_close_failed',
      operationCompleted: true,
      cause: expect.any(Error)
    })
  })
})
