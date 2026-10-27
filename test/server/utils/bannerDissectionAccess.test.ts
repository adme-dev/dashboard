import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFile, realpath } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { assertDissectionAccess, dissectionHistoryScope, resolveDissectionOwner, type DissectionAccessDb } from '../../../server/utils/banner/dissectionAccess'
import { dissectionIngestionSchema, dissectionPhysicalSchema, dissectionSourceSchema } from '../../../shared/bannerDissectionIngestion'

const user = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const client = '33333333-3333-4333-8333-333333333333'
const project = '44444444-4444-4444-8444-444444444444'
const roleId = '55555555-5555-4555-8555-555555555555'
const now = '2026-10-27T12:00:00.000Z'
const source = { version: 1, mimeType: 'image/png', byteLength: 123, width: 2, height: 2, sha256: 'a'.repeat(64) }
const owner = { kind: 'project', userId: user, projectId: project, projectOwnerId: user, clientId: client }
const ingestion = { version: 1, owner, physical: null, ingestedAt: now, sessionsInvalidatedAt: null }
const record = () => ({ user_id: user, manifest: { source, ingestion: structuredClone(ingestion) } })

// The only mock is the external query boundary. Local PostgreSQL tests below
// exercise emitted SQL separately; this fixture permits precise between-call revocation.
function fixture() {
  const state = {
    actor: { id: user, user_role: 'creative', custom_role_id: roleId, is_active: true, sessions_invalidated_at: null as string | Date | null },
    role: { id: roleId, is_read_only: false } as { id: string, is_read_only: boolean } | null,
    groups: ['CREATIVE'], assigned: true, clientExists: true,
    project: { id: project, client_id: client as string | null, created_by: user } as { id: string, client_id: string | null, created_by: string } | null,
    unavailable: false,
  }
  const db: DissectionAccessDb = { async query<T>(sql: string) {
    if (state.unavailable) throw new Error('private database detail')
    let rows: unknown[]
    if (sql.includes('FROM team_members')) rows = [state.actor]
    else if (sql.includes('FROM custom_roles')) rows = state.role ? [state.role] : []
    else if (sql.includes('FROM role_permission_groups')) rows = state.groups.map(permission_group => ({ permission_group }))
    else if (sql.includes('FROM banner_projects')) rows = state.project ? [state.project] : []
    else if (sql.includes('FROM agency_clients')) rows = state.clientExists ? [{ id: client }] : []
    else if (sql.includes('FROM client_team_assignments')) rows = state.assigned ? [{ id: other }] : []
    else throw new Error(`Unexpected SQL: ${sql}`)
    return { rows: rows as T[] }
  } }
  return { state, db }
}

describe('fresh Dissector authority', () => {
  it('derives and freezes project identity from authoritative rows', async () => {
    const { db } = fixture()
    expect(await resolveDissectionOwner(db, user, { projectId: project, source })).toEqual({ owner, sessionsInvalidatedAt: null })
  })
  it('captures the fresh session marker in canonical UTC', async () => {
    const { db, state } = fixture()
    state.actor.sessions_invalidated_at = new Date(now)
    expect((await resolveDissectionOwner(db, user, {})).sessionsInvalidatedAt).toBe(now)
  })
  it('keeps legacy personal reads and writes without a new creative grant', async () => {
    const { db, state } = fixture()
    state.actor.user_role = 'member'
    state.groups = []
    for (const mode of ['read', 'write', 'execute'] as const)
      await expect(assertDissectionAccess(db, user, { user_id: user, manifest: null }, mode)).resolves.toBeUndefined()
  })
  it.each(['read', 'write', 'execute'] as const)('requires uploader identity even for an admin (%s)', async mode => {
    const { db, state } = fixture()
    state.actor.user_role = 'owner'
    state.groups = ['ADMIN', 'CREATIVE']
    await expect(assertDissectionAccess(db, other, record(), mode)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each(['read', 'write', 'execute'] as const)('denies inactive uploaders at %s', async mode => {
    const { db, state } = fixture()
    state.actor.is_active = false
    await expect(assertDissectionAccess(db, user, record(), mode)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('allows read-only personal history but denies mutations and execution', async () => {
    const { db, state } = fixture()
    state.role!.is_read_only = true
    await expect(assertDissectionAccess(db, user, { user_id: user, manifest: null }, 'read')).resolves.toBeUndefined()
    for (const mode of ['write', 'execute'] as const)
      await expect(assertDissectionAccess(db, user, record(), mode)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('does not bypass a read-only role for an owner', async () => {
    const { db, state } = fixture()
    state.actor.user_role = 'owner'
    state.role!.is_read_only = true
    await expect(resolveDissectionOwner(db, user, {})).rejects.toMatchObject({ statusCode: 403 })
  })
  it('does not reuse a previously successful permission or membership decision', async () => {
    const { db, state } = fixture()
    await assertDissectionAccess(db, user, record(), 'execute')
    state.groups = []
    await expect(assertDissectionAccess(db, user, record(), 'execute')).rejects.toMatchObject({ statusCode: 403 })
    state.groups = ['CREATIVE']
    state.assigned = false
    await expect(assertDissectionAccess(db, user, record(), 'read')).rejects.toMatchObject({ statusCode: 403 })
  })
  it('fails closed on deleted custom role instead of legacy role fallback', async () => {
    const { db, state } = fixture()
    state.actor.user_role = 'owner'
    state.role = null
    await expect(resolveDissectionOwner(db, user, {})).rejects.toMatchObject({ statusCode: 403 })
  })
  it('requires a scoped permission as well as a management grant', async () => {
    const { db, state } = fixture()
    state.groups = ['MANAGEMENT']
    await expect(resolveDissectionOwner(db, user, { clientId: client, source })).rejects.toMatchObject({ statusCode: 403 })
    state.groups.push('CREATIVE')
    state.assigned = false
    await expect(resolveDissectionOwner(db, user, { clientId: client, source })).resolves.toMatchObject({ owner: { kind: 'client', userId: user, clientId: client } })
  })
  it.each(['deleted-project', 'deleted-client', 'changed-client', 'changed-creator', 'revoked-session'])(
    'denies %s even with fresh administrative access', async change => {
      const { db, state } = fixture()
      state.groups = ['ADMIN', 'CREATIVE']
      if (change === 'deleted-project') state.project = null
      if (change === 'deleted-client') state.clientExists = false
      if (change === 'changed-client') state.project!.client_id = other
      if (change === 'changed-creator') state.project!.created_by = other
      if (change === 'revoked-session') state.actor.sessions_invalidated_at = now
      await expect(assertDissectionAccess(db, user, record(), 'read')).rejects.toMatchObject({ statusCode: 403 })
    })
  it('requires personal project creator access without granting colleagues uploader access', async () => {
    const { db, state } = fixture()
    state.project!.client_id = null
    state.project!.created_by = other
    await expect(resolveDissectionOwner(db, user, { projectId: project, source })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rejects a contradictory client assertion without falling back to personal scope', async () => {
    const { db } = fixture()
    await expect(resolveDissectionOwner(db, user, { projectId: project, clientId: other, source })).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each([undefined, { ...source, mimeType: 'image/jpeg' }, { ...source, mimeType: 'image/webp' }, { ...source, sha256: 'forged' }])(
    'rejects scoped admission without verified PNG metadata (%j)', async source => {
      const { db } = fixture()
      await expect(resolveDissectionOwner(db, user, { clientId: client, source })).rejects.toMatchObject({ statusCode: 400 })
    })
  it.each([null, {}, { ...ingestion, version: 2 }, { ...ingestion, owner: { ...owner, userId: other } }])(
    'never downgrades malformed or mismatched stored ownership to legacy (%j)', async ingestion => {
      const { db } = fixture()
      await expect(assertDissectionAccess(db, user, { user_id: user, manifest: { source, ingestion } }, 'read')).rejects.toMatchObject({ statusCode: 403 })
    })
  it('requires source metadata for every stored ingestion record', async () => {
    const { db } = fixture()
    await expect(assertDissectionAccess(db, user, { user_id: user, manifest: { ingestion } }, 'read')).rejects.toMatchObject({ statusCode: 403 })
  })
  it('returns a sanitized temporary failure for query errors', async () => {
    const { db, state } = fixture()
    state.unavailable = true
    await expect(resolveDissectionOwner(db, user, {})).rejects.toMatchObject({ statusCode: 503, statusMessage: 'Dissection authority temporarily unavailable' })
  })
  it('validates history identifiers instead of interpolating SQL from input', async () => {
    const { db } = fixture()
    await expect(dissectionHistoryScope(db, user, { alias: 'd; DROP TABLE team_members' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(dissectionHistoryScope(db, user, { clientId: 'invalid' })).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('server-owned ingestion schemas', () => {
  it('accepts exact PNG metadata but rejects budget violations and invented fields', () => {
    expect(dissectionSourceSchema.safeParse(source).success).toBe(true)
    for (const bad of [{ ...source, width: 4097 }, { ...source, width: 4096, height: 4096 }, { ...source, byteLength: 10485761 }, { ...source, userId: user }])
      expect(dissectionSourceSchema.safeParse(bad).success).toBe(false)
  })
  it('checks the A4 pair against orientation and rejects invalid dates', () => {
    const portrait = { preset: 'A4', orientation: 'portrait', unit: 'mm', widthMm: 210, heightMm: 297 }
    expect(dissectionPhysicalSchema.safeParse(portrait).success).toBe(true)
    expect(dissectionPhysicalSchema.safeParse({ ...portrait, widthMm: 297 }).success).toBe(false)
    expect(dissectionIngestionSchema.safeParse({ ...ingestion, ingestedAt: '2026-02-30T00:00:00.000Z' }).success).toBe(false)
  })
})

// Opt-in ONLY via an owned disposable cluster; never DATABASE_URL or .env.
describe.skipIf(!process.env.BANNER_DISSECTION_ACCESS_PROOF_URL)('dissection authority on repository PostgreSQL schema', () => {
  let pool: pg.Pool
  const query = (sql: string, params?: unknown[]) => pool.query(sql, params)
  const tx = async <T>(action: (db: DissectionAccessDb) => Promise<T>) => {
    const db = await pool.connect()
    try {
      await db.query('BEGIN')
      const result = await action(db)
      await db.query('COMMIT')
      return result
    } catch (error) { await db.query('ROLLBACK'); throw error }
    finally { db.release() }
  }
  const history = (options = {}) => tx(async db => {
    const scope = await dissectionHistoryScope(db, user, options)
    const result = await db.query<{ job_id: string, user_id: string, manifest: unknown }>(
      `SELECT d.job_id, d.user_id, d.manifest FROM banner_dissections d WHERE ${scope.sql} ORDER BY d.created_at DESC LIMIT 1`, scope.params)
    for (const row of result.rows) await assertDissectionAccess(db, user, row, 'read')
    return result.rows.map(row => row.job_id)
  })
  const save = async (manifest: unknown, createdAt = now, uploader = user) => {
    const jobId = randomUUID()
    await query(`INSERT INTO banner_dissections (job_id,user_id,source_r2_key,manifest,created_at)
      VALUES ($1,$2,'private-test-only',$3::jsonb,$4)`, [jobId, uploader, JSON.stringify(manifest), createdAt])
    return jobId
  }
  beforeAll(async () => {
    const url = new URL(process.env.BANNER_DISSECTION_ACCESS_PROOF_URL!)
    const root = await realpath(process.env.BANNER_DISSECTION_ACCESS_PROOF_ROOT!)
    if (url.hostname !== '127.0.0.1' || !root.startsWith('/private/tmp/dissection-authority-')) throw new Error('Not an owned loopback proof')
    const proof = JSON.parse(await readFile(`${root}/owner.json`, 'utf8'))
    if (proof.token !== process.env.BANNER_DISSECTION_ACCESS_PROOF_TOKEN || proof.url !== url.toString()) throw new Error('Invalid proof ownership')
    pool = new pg.Pool({ connectionString: url.toString(), max: 4 })
    const data = await query('SHOW data_directory')
    if (await realpath(data.rows[0].data_directory) !== `${root}/data`) throw new Error('Not the owned PostgreSQL cluster')
    const base = await readFile(new URL('../../../server/database/schema.sql', import.meta.url), 'utf8')
    const auth = await readFile(new URL('../../../server/database/schema-auth.sql', import.meta.url), 'utf8')
    await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    for (const table of ['team_members', 'agency_clients']) {
      const statement = base.match(new RegExp(`CREATE TABLE ${table} \\([\\s\\S]*?\\n\\);`))?.[0]
      if (!statement) throw new Error(`Missing repository table ${table}`)
      await query(statement)
    }
    await query(auth.match(/CREATE TYPE user_role AS ENUM \([^;]+;/)![0])
    await query(auth.match(/ALTER TABLE team_members ADD COLUMN IF NOT EXISTS user_role[^;]+;/)![0])
    for (const file of ['061-user-roles-expansion.sql', '062-custom-roles-permissions.sql', '064-client-team-assignments.sql', '191_session_invalidation.sql', '026-banner-studio.sql', '034-banner-dissector.sql'])
      await query(await readFile(new URL(`../../../server/database/migrations/${file}`, import.meta.url), 'utf8'))
  }, 15000)
  beforeEach(async () => {
    await query('TRUNCATE team_members, agency_clients CASCADE')
    await query(`INSERT INTO custom_roles (id,name,slug,is_system,is_read_only) VALUES ($1,'Creative','creative',TRUE,FALSE)`, [roleId])
    await query(`INSERT INTO role_permission_groups (role_id,permission_group) VALUES ($1,'CREATIVE')`, [roleId])
    await query(`INSERT INTO team_members (id,name,email,user_role,custom_role_id) VALUES
      ($1,'Uploader','uploader@example.invalid','creative',$3),($2,'Other','other@example.invalid','creative',$3)`, [user, other, roleId])
    await query(`INSERT INTO agency_clients (id,name,billing_type) VALUES ($1,'Synthetic client','project'),($2,'Other client','project')`, [client, other])
    await query('INSERT INTO client_team_assignments (client_id,team_member_id) VALUES ($1,$2)', [client, user])
    await query(`INSERT INTO banner_projects (id,name,client_id,created_by) VALUES ($1,'Synthetic project',$2,$3)`, [project, client, user])
  })
  afterAll(async () => { await pool?.end() })

  it('executes the fresh resolution query against real role and scope columns', async () => {
    expect(await tx(db => resolveDissectionOwner(db, user, { projectId: project, source }))).toEqual({ owner, sessionsInvalidatedAt: null })
  })
  it('filters foreign uploader and unauthorized newer jobs before LIMIT', async () => {
    const allowed = await save(null)
    await save({ source, ingestion: { ...ingestion, owner: { kind: 'client', userId: user, clientId: other } } }, '2026-10-27T12:01:00.000Z')
    await save(null, '2026-10-27T12:02:00.000Z', other)
    expect(await history()).toEqual([allowed])
  })
  it('filters frozen project changes and revoked assignment before LIMIT', async () => {
    const personal = await save(null)
    await save(record().manifest, '2026-10-27T12:01:00.000Z')
    expect(await history()).not.toEqual([personal])
    await query('DELETE FROM client_team_assignments WHERE team_member_id=$1', [user])
    expect(await history()).toEqual([personal])
    await query('INSERT INTO client_team_assignments (client_id,team_member_id) VALUES ($1,$2)', [client, user])
    await query('UPDATE banner_projects SET created_by=$1 WHERE id=$2', [other, project])
    expect(await history()).toEqual([personal])
  })
  it('filters session-revoked metadata while preserving legacy read compatibility', async () => {
    const legacy = await save(null)
    await save(record().manifest, '2026-10-27T12:01:00.000Z')
    await query('UPDATE team_members SET sessions_invalidated_at=$1 WHERE id=$2', [now, user])
    expect(await history()).toEqual([legacy])
  })
  it('uses ingestion scope for filters, never import destination project_id', async () => {
    const scoped = await save(record().manifest)
    const legacy = await save(null, '2026-10-27T12:01:00.000Z')
    await query('UPDATE banner_dissections SET project_id=$1 WHERE job_id=$2', [project, legacy])
    expect(await history({ projectId: project, clientId: client })).toEqual([scoped])
  })
  it('removes scoped history when the configured permission row is deleted', async () => {
    const legacy = await save(null)
    await save(record().manifest, '2026-10-27T12:01:00.000Z')
    await query('DELETE FROM role_permission_groups WHERE role_id=$1', [roleId])
    expect(await history()).toEqual([legacy])
    await expect(tx(db => assertDissectionAccess(db, user, record(), 'execute'))).rejects.toMatchObject({ statusCode: 403 })
  })
  it('does not union legacy system permissions into an explicitly configured empty custom role', async () => {
    await query(`INSERT INTO custom_roles (id,name,slug,is_read_only) VALUES ($1,'Restricted','restricted',FALSE)`, [other])
    await query('UPDATE team_members SET custom_role_id=$1 WHERE id=$2', [other, user])
    await expect(tx(db => resolveDissectionOwner(db, user, { clientId: client, source }))).rejects.toMatchObject({ statusCode: 403 })
    await expect(tx(db => resolveDissectionOwner(db, user, {}))).resolves.toMatchObject({ owner: { kind: 'user', userId: user } })
  })
  it('resolves system roles by current DB slug only when no custom role is configured', async () => {
    await query('UPDATE team_members SET custom_role_id=NULL WHERE id=$1', [user])
    await expect(tx(db => resolveDissectionOwner(db, user, { clientId: client, source }))).resolves.toMatchObject({ owner: { kind: 'client' } })
    await query('DELETE FROM custom_roles WHERE id=$1', [roleId])
    await expect(tx(db => resolveDissectionOwner(db, user, {}))).rejects.toMatchObject({ statusCode: 403 })
  })
  it('supports a caller parameter prefix without confusing actor and scope identifiers', async () => {
    const jobId = await save(record().manifest)
    const result = await tx(async db => {
      const scope = await dissectionHistoryScope(db, user, { alias: 'jobs', parameterOffset: 1, projectId: project })
      return db.query<{ job_id: string }>(`SELECT jobs.job_id FROM banner_dissections jobs WHERE jobs.job_id=$1 AND ${scope.sql}`, [jobId, ...scope.params])
    })
    expect(result.rows).toEqual([{ job_id: jobId }])
  })
  it('rejects malformed metadata before history projection even if the coarse scope matches', async () => {
    await save({ source: { ...source, sha256: 'forged' }, ingestion })
    await expect(history()).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each([
    ['uploader', 'UPDATE team_members SET is_active=FALSE WHERE id=$1', user],
    ['role policy', 'UPDATE custom_roles SET is_read_only=TRUE WHERE id=$1', roleId],
    ['permission', 'DELETE FROM role_permission_groups WHERE role_id=$1', roleId],
    ['project', 'UPDATE banner_projects SET created_by=$1', other],
    ['client', 'DELETE FROM agency_clients WHERE id=$1', client],
    ['assignment', 'DELETE FROM client_team_assignments WHERE client_id=$1', client],
  ])('holds %s authority stable until the effect transaction ends', async (_name, sql, parameter) => {
    const reader = await pool.connect(), writer = await pool.connect()
    try {
      await reader.query('BEGIN')
      await assertDissectionAccess(reader, user, record(), 'execute')
      await writer.query('BEGIN')
      await writer.query("SET LOCAL lock_timeout='100ms'")
      await expect(writer.query(sql, [parameter])).rejects.toMatchObject({ code: '55P03' })
      await writer.query('ROLLBACK')
      await reader.query('COMMIT')
      await writer.query(sql, [parameter])
      await expect(tx(db => assertDissectionAccess(db, user, record(), 'execute'))).rejects.toMatchObject({ statusCode: 403 })
    } finally {
      await reader.query('ROLLBACK')
      await writer.query('ROLLBACK')
      reader.release(); writer.release()
    }
  })
})
