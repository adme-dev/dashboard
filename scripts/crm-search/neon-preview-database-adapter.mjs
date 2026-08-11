import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const API_ORIGIN = 'https://console.neon.tech/api/v2'
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u
const PROJECT_ID = /^[a-z][a-z0-9-]{2,119}$/u
const BRANCH_ID = /^br-[a-z0-9-]{3,119}$/u
const ENDPOINT_ID = /^ep-[a-z0-9-]{3,119}$/u
const DIGEST = /^[a-f0-9]{64}$/u
const COMMAND = /^[A-Za-z0-9_+@./-]{1,512}$/u
const REQUIRED_ROLE = 'neondb_owner'
const REQUIRED_DATABASE = 'neondb'
const REQUIRED_TABLES = Object.freeze([
  'crm_people', 'crm_companies', 'crm_opportunities'
])
const PREREQUISITE_MIGRATIONS = Object.freeze([
  'server/database/migrations/134-crm-core.sql',
  'server/database/migrations/135-crm-opportunities.sql'
])
const SEARCH_MIGRATIONS = Object.freeze([
  'server/database/migrations/350_crm_search_expand.sql',
  'server/database/migrations/351_crm_search_validate_backfill.sql',
  'server/database/migrations/352_crm_search_activate_capture.sql'
])
const ALL_MIGRATIONS = Object.freeze([
  ...PREREQUISITE_MIGRATIONS, ...SEARCH_MIGRATIONS
])

function exactKeys(value, keys) {
  return value && typeof value === 'object'
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
}

function validateTarget({ projectId, branchId, endpoint }) {
  if (!PROJECT_ID.test(projectId ?? '') || !BRANCH_ID.test(branchId ?? '')
    || !exactKeys(endpoint, ['id', 'branchId', 'host'])
    || !ENDPOINT_ID.test(endpoint.id ?? '') || endpoint.branchId !== branchId
    || !endpoint.host.startsWith(`${endpoint.id}.`) || !endpoint.host.endsWith('.neon.tech')
    || endpoint.host.includes('-pooler.') || endpoint.host.includes('-pooler-')) {
    throw new Error('crm_search_neon_connection_invalid')
  }
}

function validateExactList(actual, expected, errorCode) {
  if (!Array.isArray(actual) || actual.length !== expected.length
    || actual.some((value, index) => value !== expected[index])) {
    throw new Error(errorCode)
  }
}

function workspaceMigrationDigests() {
  return Object.fromEntries(ALL_MIGRATIONS.map(path => [
    path,
    createHash('sha256')
      .update(readFileSync(new URL(`../../${path}`, import.meta.url)))
      .digest('hex')
  ]))
}

export function createNeonPreviewDatabaseAdapter(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const spawnSyncImpl = options.spawnSyncImpl ?? spawnSync
  const currentTime = options.currentTime ?? (() => Date.now())
  const sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
  const schemaPollAttempts = options.schemaPollAttempts ?? 24
  const sourceBranchId = options.sourceBranchId ?? null
  const pgDumpCommand = options.pgDumpCommand ?? 'pg_dump'
  if (typeof options.apiToken !== 'string' || options.apiToken.length < 20
    || typeof fetchImpl !== 'function' || typeof spawnSyncImpl !== 'function'
    || typeof currentTime !== 'function' || typeof sleep !== 'function'
    || !Number.isSafeInteger(schemaPollAttempts)
    || schemaPollAttempts < 1 || schemaPollAttempts > 48
    || (sourceBranchId !== null && !BRANCH_ID.test(sourceBranchId))
    || !COMMAND.test(pgDumpCommand)) {
    throw new Error('crm_search_neon_database_adapter_invalid')
  }

  const connectionCache = new Map()
  const request = async (pathname) => {
    const response = await fetchImpl(`${API_ORIGIN}${pathname}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${options.apiToken}`
      }
    })
    if (!response?.ok) throw new Error('crm_search_neon_api_failed')
    return await response.json()
  }

  const resolveConnection = async (target) => {
    validateTarget(target)
    const cacheKey = `${target.projectId}\0${target.branchId}\0${target.endpoint.id}`
    if (connectionCache.has(cacheKey)) return connectionCache.get(cacheKey)

    const project = encodeURIComponent(target.projectId)
    const branch = encodeURIComponent(target.branchId)
    const [roles, databases, connection] = await Promise.all([
      request(`/projects/${project}/branches/${branch}/roles`),
      request(`/projects/${project}/branches/${branch}/databases`),
      request(`/projects/${project}/connection_uri?branch_id=${branch}&database_name=${REQUIRED_DATABASE}&role_name=${REQUIRED_ROLE}&pooled=false`)
    ])
    if (!Array.isArray(roles?.roles)
      || roles.roles.length !== 1 || roles.roles[0]?.name !== REQUIRED_ROLE
      || !Array.isArray(databases?.databases) || databases.databases.length !== 1
      || databases.databases[0]?.name !== REQUIRED_DATABASE
      || databases.databases[0]?.owner_name !== REQUIRED_ROLE
      || typeof connection?.uri !== 'string') {
      throw new Error('crm_search_neon_connection_invalid')
    }

    let parsed
    try {
      parsed = new URL(connection.uri)
    } catch {
      throw new Error('crm_search_neon_connection_invalid')
    }
    let username
    let database
    let password
    try {
      username = decodeURIComponent(parsed.username)
      database = decodeURIComponent(parsed.pathname.slice(1))
      password = decodeURIComponent(parsed.password)
    } catch {
      throw new Error('crm_search_neon_connection_invalid')
    }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
      || parsed.hostname !== target.endpoint.host
      || parsed.hostname.includes('-pooler.') || parsed.hostname.includes('-pooler-')
      || username !== REQUIRED_ROLE || database !== REQUIRED_DATABASE || !password
      || parsed.searchParams.get('sslmode') !== 'require') {
      throw new Error('crm_search_neon_connection_invalid')
    }

    const resolved = Object.freeze({
      host: parsed.hostname,
      database: REQUIRED_DATABASE,
      user: REQUIRED_ROLE,
      password
    })
    connectionCache.set(cacheKey, resolved)
    return resolved
  }

  const resolveSourceConnection = async (target) => {
    if (!BRANCH_ID.test(target.sourceBranchId ?? '')
      || target.sourceBranchId !== sourceBranchId
      || target.sourceBranchId === target.branchId) {
      throw new Error('crm_search_neon_source_connection_invalid')
    }
    const cacheKey = `${target.projectId}\0${target.sourceBranchId}\0source`
    if (connectionCache.has(cacheKey)) return connectionCache.get(cacheKey)

    const project = encodeURIComponent(target.projectId)
    const branch = encodeURIComponent(target.sourceBranchId)
    const [roles, databases, connection] = await Promise.all([
      request(`/projects/${project}/branches/${branch}/roles`),
      request(`/projects/${project}/branches/${branch}/databases`),
      request(`/projects/${project}/connection_uri?branch_id=${branch}&database_name=${REQUIRED_DATABASE}&role_name=${REQUIRED_ROLE}&pooled=false`)
    ])
    if (!Array.isArray(roles?.roles)
      || !roles.roles.some(role => role?.name === REQUIRED_ROLE)
      || !Array.isArray(databases?.databases)
      || !databases.databases.some(database => database?.name === REQUIRED_DATABASE
        && database?.owner_name === REQUIRED_ROLE)
      || typeof connection?.uri !== 'string') {
      throw new Error('crm_search_neon_source_connection_invalid')
    }

    let parsed
    try {
      parsed = new URL(connection.uri)
    } catch {
      throw new Error('crm_search_neon_source_connection_invalid')
    }
    let username
    let database
    let password
    try {
      username = decodeURIComponent(parsed.username)
      database = decodeURIComponent(parsed.pathname.slice(1))
      password = decodeURIComponent(parsed.password)
    } catch {
      throw new Error('crm_search_neon_source_connection_invalid')
    }
    const sourceEndpointId = parsed.hostname.split('.')[0]
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
      || !ENDPOINT_ID.test(sourceEndpointId) || !parsed.hostname.endsWith('.neon.tech')
      || parsed.hostname.includes('-pooler.') || parsed.hostname.includes('-pooler-')
      || parsed.hostname === target.endpoint.host
      || username !== REQUIRED_ROLE || database !== REQUIRED_DATABASE || !password
      || parsed.searchParams.get('sslmode') !== 'require') {
      throw new Error('crm_search_neon_source_connection_invalid')
    }

    const resolved = Object.freeze({
      host: parsed.hostname,
      database: REQUIRED_DATABASE,
      user: REQUIRED_ROLE,
      password
    })
    connectionCache.set(cacheKey, resolved)
    return resolved
  }

  const connectionEnvironment = connection => ({
    ...process.env,
    PGHOST: connection.host,
    PGDATABASE: connection.database,
    PGUSER: connection.user,
    PGPASSWORD: connection.password,
    PGSSLMODE: 'require'
  })

  const runPsql = async (target, args) => {
    const connection = await resolveConnection(target)
    const result = spawnSyncImpl('psql', ['-X', '-v', 'ON_ERROR_STOP=1', ...args], {
      cwd: new URL('../..', import.meta.url),
      encoding: 'utf8',
      env: connectionEnvironment(connection),
      maxBuffer: 1024 * 1024,
      timeout: 120_000
    })
    if (result?.status !== 0) throw new Error('crm_search_neon_psql_failed')
    return typeof result.stdout === 'string' ? result.stdout : ''
  }

  const applyExactMigrations = async (input, requiredPaths) => {
    validateTarget(input)
    validateExactList(input.migrationPaths, requiredPaths, 'crm_search_neon_migrations_invalid')
    const expectedDigests = workspaceMigrationDigests()
    if (!exactKeys(input.migrationDigests, ALL_MIGRATIONS)
      || ALL_MIGRATIONS.some(path => !DIGEST.test(input.migrationDigests[path] ?? '')
        || input.migrationDigests[path] !== expectedDigests[path])) {
      throw new Error('crm_search_neon_migrations_invalid')
    }
    for (const path of requiredPaths) {
      await runPsql(input, ['-f', new URL(`../../${path}`, import.meta.url).pathname])
    }
    return Object.freeze({ ok: true, applied: [...requiredPaths] })
  }

  const parentSchemaReady = async (input) => {
    const output = await runPsql(input, [
      '-At', '-c',
      'SELECT CASE WHEN to_regclass(\'public.agency_clients\') IS NULL THEN \'missing\' ELSE \'ready\' END'
    ])
    return output.trim() === 'ready'
  }

  const waitForParentSchema = async (input) => {
    for (let attempt = 0; attempt < schemaPollAttempts; attempt += 1) {
      if (await parentSchemaReady(input)) return
      if (attempt + 1 < schemaPollAttempts) await sleep(2_500)
    }
    throw new Error('crm_search_neon_parent_schema_unavailable')
  }

  const materializeParentSchema = async (input) => {
    const source = await resolveSourceConnection(input)
    const dumped = spawnSyncImpl(pgDumpCommand, [
      '--schema-only', '--no-owner', '--no-privileges', '--no-comments',
      '--no-security-labels', '--format=plain'
    ], {
      cwd: new URL('../..', import.meta.url),
      encoding: 'utf8',
      env: connectionEnvironment(source),
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120_000
    })
    const schemaSql = typeof dumped?.stdout === 'string' ? dumped.stdout : ''
    const schemaBytes = Buffer.byteLength(schemaSql)
    if (dumped?.status !== 0 || schemaBytes < 64 || schemaBytes > 64 * 1024 * 1024
      || !/CREATE TABLE public\.agency_clients\s*\(/u.test(schemaSql)
      || /(?:^|\n)(?:COPY|INSERT INTO)\s/iu.test(schemaSql)
      || /\bcrm_search_[a-z0-9_]+\b/iu.test(schemaSql)) {
      throw new Error('crm_search_neon_parent_schema_dump_invalid')
    }

    if (!await parentSchemaReady(input)) {
      const target = await resolveConnection(input)
      const restored = spawnSyncImpl(
        'psql', ['-X', '-v', 'ON_ERROR_STOP=1', '--single-transaction'], {
          cwd: new URL('../..', import.meta.url),
          encoding: 'utf8',
          env: connectionEnvironment(target),
          input: schemaSql,
          maxBuffer: 64 * 1024 * 1024,
          timeout: 240_000
        }
      )
      if (restored?.status !== 0) throw new Error('crm_search_neon_parent_schema_restore_failed')
    }
    return Object.freeze({
      method: 'pg_dump_schema_only',
      sourceBranchId: input.sourceBranchId,
      sha256: createHash('sha256').update(schemaSql).digest('hex')
    })
  }

  return Object.freeze({
    async assertEmpty(input) {
      validateTarget(input)
      if (!UUID.test(input.organisationScopeId ?? '')) {
        throw new Error('crm_search_neon_source_scope_invalid')
      }
      validateExactList(input.tables, REQUIRED_TABLES, 'crm_search_neon_source_tables_invalid')
      const sql = REQUIRED_TABLES
        .map(table => `SELECT '${table}', COUNT(*) FROM ${table};`)
        .join('\n')
      const output = await runPsql(input, ['-At', '-F', ',', '-c', sql])
      const rows = output.trim().split(/\r?\n/u).filter(Boolean)
      if (rows.length !== REQUIRED_TABLES.length) {
        throw new Error('crm_search_neon_source_proof_invalid')
      }
      const counts = Object.fromEntries(rows.map((row) => {
        const [table, rawCount, ...extra] = row.split(',')
        const count = Number(rawCount)
        if (extra.length > 0 || !REQUIRED_TABLES.includes(table)
          || !Number.isSafeInteger(count) || count < 0) {
          throw new Error('crm_search_neon_source_proof_invalid')
        }
        return [table, count]
      }))
      if (Object.keys(counts).length !== REQUIRED_TABLES.length
        || REQUIRED_TABLES.some(table => counts[table] !== 0)) {
        throw new Error('crm_search_neon_source_not_empty')
      }
      return Object.freeze({
        organisationScopeId: input.organisationScopeId,
        checkedAt: new Date(currentTime()).toISOString(),
        tables: Object.freeze(Object.fromEntries(REQUIRED_TABLES.map(table => [table, 0])))
      })
    },

    async applyPrerequisiteMigrations(input) {
      const sourceSchemaProof = input.sourceBranchId
        ? await materializeParentSchema(input)
        : null
      await waitForParentSchema(input)
      const applied = await applyExactMigrations(input, PREREQUISITE_MIGRATIONS)
      return sourceSchemaProof ? { ...applied, sourceSchemaProof } : applied
    },

    async applyMigrations(input) {
      return await applyExactMigrations(input, SEARCH_MIGRATIONS)
    }
  })
}
