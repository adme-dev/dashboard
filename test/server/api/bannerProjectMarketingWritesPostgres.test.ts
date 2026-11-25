import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { clearExpiredBannerBin, setBannerFolderBinned } from '~~/server/utils/banner/folderBin'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Browser Banner Studio PATCH/duplicate for the marketing portfolio on PostgreSQL: the real route
// SQL, the real fresh marketing permission and client-access helpers, and the guarded write
// predicates. Only requireAuth and connection acquisition are replaced.
const adapter = vi.hoisted(() => ({
  db: undefined as undefined | { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  beforeWrite: undefined as undefined | (() => Promise<void>),
  user: {} as Record<string, unknown>
}))
async function rows(sql: string, params?: unknown[]) {
  if (!adapter.db) throw new Error('Disposable database is not connected')
  if (/UPDATE banner_projects|INSERT INTO banner_projects|SELECT id FROM banner_projects[\s\S]*FOR UPDATE/.test(sql)) await adapter.beforeWrite?.()
  return (await adapter.db.query(sql, params)).rows
}
async function inTransaction<T>(work: (db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<T>): Promise<T> {
  if (!adapter.db) throw new Error('Disposable database is not connected')
  await adapter.db.query('BEGIN')
  try {
    const result = await work({ query: async (sql, params) => ({ rows: await rows(sql, params) }) })
    await adapter.db.query('COMMIT')
    return result
  } catch (error) {
    await adapter.db.query('ROLLBACK')
    throw error
  }
}
vi.mock('~~/server/utils/db', () => ({
  queryOne: async (sql: string, params?: unknown[]) => (await rows(sql, params))[0] ?? null,
  queryOneFresh: async (sql: string, params?: unknown[]) => (await rows(sql, params))[0] ?? null,
  queryRowsFresh: rows,
  queryRows: async (sql: string, params?: unknown[]) => rows(sql, params),
  execute: async (sql: string, params?: unknown[]) => (await rows(sql, params)).length,
  transaction: inTransaction
}))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: async () => adapter.user, requireWriteAccess: async () => adapter.user }))
vi.mock('~~/server/utils/banner/godModeProjectCreation', () => ({
  executeGodModeBannerProjectCreation: (_event: unknown, create: Parameters<typeof inTransaction>[0]) => inTransaction(create)
}))
vi.mock('~~/server/utils/kv', () => ({ kvGet: async () => null, kvPut: () => undefined, kvDelete: () => undefined }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', (event: { params: { id: string } }) => event.params.id)
vi.stubGlobal('getValidatedRouterParams', (event: { params: { id: string } }, validate: (params: object) => unknown) => validate(event.params))
vi.stubGlobal('getQuery', (event: { query?: object }) => event.query ?? {})
vi.stubGlobal('setHeader', vi.fn())
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)

const databaseUrl = process.env.MARKETING_MCP_STUDIO_BRIDGE_DATABASE_TEST_URL
if (databaseUrl && !['127.0.0.1', 'localhost'].includes(new URL(databaseUrl).hostname)) {
  throw new Error('The banner write test requires a disposable localhost PostgreSQL')
}
const STAFF = '30000000-0000-4000-8000-000000000911'
const ROLE = '60000000-0000-4000-8000-000000000911'
const ACTIVE = '20000000-0000-4000-8000-000000000911'
const OTHER = '20000000-0000-4000-8000-000000000912'
const SHA = `source-sha256:${'a'.repeat(64)}`

const patch = (await import('~~/server/api/agency/banner-studio/projects/[id].patch')).default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const duplicate = (await import('~~/server/api/agency/banner-studio/projects/[id]/duplicate.post')).default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const remove = (await import('~~/server/api/agency/banner-studio/projects/[id].delete')).default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const list = (await import('~~/server/api/agency/banner-studio/projects/index.get')).default
const restore = (await import('~~/server/api/agency/banner-studio/projects/[id]/restore.post')).default as unknown as typeof patch
const create = (await import('~~/server/api/agency/banner-studio/projects/index.post')).default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const call = (handler: typeof patch, id: string, body: Record<string, unknown> = {}) => handler({ params: { id }, body, context: {} } as unknown as H3Event)

describe.runIf(Boolean(databaseUrl))('marketing Banner Studio browser writes on PostgreSQL', () => {
  let db: pg.Client
  let schema: string
  let project: string
  const projectRow = async () => (await db.query('SELECT name, client_id, tags, canvas_data, binned_at FROM banner_projects WHERE id = $1', [project])).rows[0]

  beforeEach(async () => {
    schema = `banner_marketing_${randomUUID().replaceAll('-', '')}`
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`CREATE SCHEMA "${schema}"`)
    await db.query(`SET search_path TO "${schema}", public, pg_catalog`)
    await db.query(`
      CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role TEXT,custom_role_id UUID, dashboard_preferences JSONB);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN,is_read_only BOOLEAN);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT);
      CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN, name TEXT);
      CREATE TABLE client_team_assignments(client_id UUID, team_member_id UUID);
      CREATE TABLE banner_folders(id UUID PRIMARY KEY, parent_id UUID REFERENCES banner_folders(id), name TEXT);
      CREATE TABLE banner_projects(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL,
        client_id UUID REFERENCES agency_clients(id), folder_id UUID REFERENCES banner_folders(id), canvas_data JSONB NOT NULL DEFAULT '{}', thumbnail_url TEXT,
        status VARCHAR(20) DEFAULT 'draft', tags TEXT[] DEFAULT '{}', created_by UUID NOT NULL REFERENCES team_members(id),
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), review_status TEXT NOT NULL DEFAULT 'draft');
      CREATE TABLE banner_dissections(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID REFERENCES banner_projects(id));
      CREATE TABLE banner_versions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID, version_number INT,
        canvas_data JSONB, created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE banner_assets(id UUID PRIMARY KEY, name TEXT, mime_type TEXT, file_size INT, r2_key TEXT, url TEXT,
        tags TEXT[], uploaded_by UUID, client_id UUID, created_at TIMESTAMPTZ DEFAULT NOW());
    `)
    await db.query(readFileSync('server/database/migrations/522_banner_folder_bin.sql', 'utf8'))
    await db.query('INSERT INTO custom_roles VALUES($1,\'marketing\',FALSE,FALSE)', [ROLE])
    await db.query('INSERT INTO role_permission_groups VALUES($1,\'MARKETING_MANAGEMENT\')', [ROLE])
    await db.query('INSERT INTO team_members VALUES($1,TRUE,\'staff\',$2)', [STAFF, ROLE])
    await db.query('INSERT INTO agency_clients VALUES($1,TRUE),($2,TRUE)', [ACTIVE, OTHER])
    project = (await db.query(`INSERT INTO banner_projects(name, client_id, canvas_data, tags, created_by)
      VALUES('Spring', $1, '{"mrec":{"layers":[]}}', ARRAY['launch'], $2) RETURNING id`, [ACTIVE, STAFF])).rows[0].id
    adapter.db = db
    adapter.beforeWrite = undefined
    adapter.user = { id: STAFF, role: 'staff', permissionGroups: ['MARKETING_MANAGEMENT'] }
  })

  afterEach(async () => {
    adapter.db = undefined
    try {
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally {
      await db.end()
    }
  })

  it('runs the guarded PATCH SQL, including a move to another active client', async () => {
    expect(await call(patch, project, { name: 'Summer', canvasData: { mrec: { layers: [{ id: 'new' }] } } })).toMatchObject({ name: 'Summer' })
    expect((await db.query('SELECT COUNT(*)::int AS n FROM banner_versions')).rows[0].n).toBe(1)
    expect(await call(patch, project, { clientId: OTHER })).toMatchObject({ clientId: OTHER })
  })

  it('corrects an imported client while preserving scoped font bytes and every saved canvas', async () => {
    const font = randomUUID()
    const canvas = { mrec: { layers: [{ id: 1, type: 'text', text: 'Ringwood', x: 18, fontFamily: 'Exact source face', fontWeight: 400, fontAssetId: font }] } }
    await db.query(`INSERT INTO banner_assets VALUES($1,'Exact source face','font/woff',123,'fonts/original.woff','https://assets.example/original.woff',ARRAY['font','weight:400'],$2,$3,NOW())`, [font, STAFF, ACTIVE])
    await db.query('UPDATE banner_projects SET canvas_data=$1, tags=$2 WHERE id=$3', [canvas, ['source:thebrief', SHA], project])
    await db.query('INSERT INTO banner_versions(project_id,version_number,canvas_data,created_by) VALUES($1,1,$2,$3)', [project, canvas, STAFF])
    const updated = await call(patch, project, { clientId: OTHER })
    const moved = updated.canvasData as typeof canvas
    const targetFont = moved.mrec.layers[0].fontAssetId
    expect(targetFont).not.toBe(font)
    expect(moved).toEqual({ mrec: { layers: [{ ...canvas.mrec.layers[0], fontAssetId: targetFont }] } })
    const faces = (await db.query('SELECT id,client_id,r2_key,url FROM banner_assets ORDER BY client_id')).rows
    expect(faces).toHaveLength(2)
    expect(faces).toContainEqual({ id: font, client_id: ACTIVE, r2_key: 'fonts/original.woff', url: 'https://assets.example/original.woff' })
    expect(faces).toContainEqual({ id: targetFont, client_id: OTHER, r2_key: 'fonts/original.woff', url: 'https://assets.example/original.woff' })
    const versions = (await db.query('SELECT canvas_data FROM banner_versions WHERE project_id=$1', [project])).rows
    expect(versions).toHaveLength(2)
    expect(versions.every(version => JSON.stringify(version.canvas_data) === JSON.stringify(moved))).toBe(true)
    expect((await projectRow()).tags).toEqual(['source:thebrief', SHA])
  })

  it('fails closed when the source or target client is deactivated between the check and the UPDATE', async () => {
    adapter.beforeWrite = async () => {
      await db.query('UPDATE agency_clients SET is_active = FALSE WHERE id = $1', [ACTIVE])
    }
    await expect(call(patch, project, { name: 'Late' })).rejects.toMatchObject({ statusCode: 409 })
    expect((await projectRow()).name).toBe('Spring')
    await db.query('UPDATE agency_clients SET is_active = TRUE')
    adapter.beforeWrite = async () => {
      await db.query('UPDATE agency_clients SET is_active = FALSE WHERE id = $1', [OTHER])
    }
    await expect(call(patch, project, { clientId: OTHER })).rejects.toMatchObject({ statusCode: 409 })
    expect((await projectRow()).client_id).toBe(ACTIVE)
  })

  it('fails closed when review starts between the check and the UPDATE, and after permission revocation', async () => {
    adapter.beforeWrite = async () => {
      await db.query('UPDATE banner_projects SET review_status = \'in_review\' WHERE id = $1', [project])
    }
    await expect(call(patch, project, { canvasData: { mrec: { layers: [{ id: 'x' }] } } })).rejects.toMatchObject({ statusCode: 409 })
    adapter.beforeWrite = undefined
    await db.query('UPDATE banner_projects SET review_status = \'draft\'')
    await db.query('DELETE FROM role_permission_groups')
    await expect(call(patch, project, { name: 'x' })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('keeps provenance on tag edits, and duplicates without provenance only into an active client', async () => {
    const folderId = randomUUID()
    await db.query('INSERT INTO banner_folders(id) VALUES($1)', [folderId])
    await db.query('UPDATE banner_projects SET tags = $2, folder_id = $3 WHERE id = $1', [project, ['source:thebrief', SHA], folderId])
    await call(patch, project, { tags: ['fresh'] })
    expect((await projectRow()).tags).toEqual(['source:thebrief', SHA, 'fresh'])
    expect(await call(duplicate, project)).toMatchObject({ clientId: ACTIVE, folderId, tags: ['fresh'] })
    adapter.beforeWrite = async () => {
      await db.query('UPDATE agency_clients SET is_active = FALSE WHERE id = $1', [ACTIVE])
    }
    await expect(call(duplicate, project)).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT COUNT(*)::int AS n FROM banner_projects')).rows[0].n).toBe(2)
  })

  it('deletes only unprotected active-client artwork, under a lock bound to the checked state', async () => {
    await db.query('INSERT INTO banner_dissections(project_id) VALUES($1)', [project])
    await db.query('UPDATE banner_projects SET review_status = \'approved\' WHERE id = $1', [project])
    await expect(call(remove, project)).rejects.toMatchObject({ statusCode: 409 })
    await db.query('UPDATE banner_projects SET review_status = \'draft\' WHERE id = $1', [project])
    // Review starts, or the client is deactivated, between the check and the locked delete.
    for (const race of ['UPDATE banner_projects SET review_status = \'in_review\'', `UPDATE agency_clients SET is_active = FALSE WHERE id = '${ACTIVE}'`]) {
      adapter.beforeWrite = async () => {
        await db.query(race)
      }
      await expect(call(remove, project)).rejects.toMatchObject({ statusCode: 409 })
      adapter.beforeWrite = undefined
      await db.query('UPDATE banner_projects SET review_status = \'draft\'')
      await db.query('UPDATE agency_clients SET is_active = TRUE')
    }
    expect(await projectRow()).toBeDefined()
    expect(await call(remove, project)).toEqual({ success: true, message: 'Design moved to recycling bin' })
    expect(await projectRow()).toMatchObject({ client_id: ACTIVE, binned_at: expect.any(Date) })
    expect((await db.query('SELECT COUNT(*)::int AS n FROM banner_dissections')).rows[0].n).toBe(1)
  })

  it('keeps client designs accessible through folder deletion, restoration and expiry', async () => {
    const root = randomUUID(), child = randomUUID()
    await db.query('INSERT INTO banner_folders(id, name) VALUES ($1, $2)', [root, 'Campaign'])
    await db.query('INSERT INTO banner_folders(id, parent_id, name) VALUES ($1, $2, $3)', [child, root, 'Logos'])
    await db.query('UPDATE banner_projects SET folder_id = $1 WHERE id = $2', [child, project])
    const library = (view: string) => list({ query: { clientId: ACTIVE, view }, context: {} } as unknown as H3Event)
    await setBannerFolderBinned(root, true)
    expect(await library('library')).toContainEqual(expect.objectContaining({ id: project, clientId: ACTIVE, folderId: null }))
    expect(await library('bin')).toEqual([])
    await expect(db.query('INSERT INTO banner_projects(name, created_by, folder_id) VALUES ($1,$2,$3)', ['New', STAFF, child])).rejects.toMatchObject({ code: '23503' })
    await db.query('INSERT INTO banner_folders(id, name) VALUES ($1,$2)', [randomUUID(), 'Campaign'])
    await setBannerFolderBinned(root, false)
    expect((await db.query('SELECT name FROM banner_folders WHERE id=$1', [root])).rows[0].name).toBe('Campaign (restored)')
    expect(await library('library')).toContainEqual(expect.objectContaining({ id: project, folderId: child }))
    await setBannerFolderBinned(root, true)
    await db.query('UPDATE banner_folders SET binned_at = now() - interval \'31 days\' WHERE bin_root_id = $1', [root])
    await clearExpiredBannerBin()
    expect((await db.query('SELECT id FROM banner_folders WHERE id=$1', [child])).rows).toEqual([])
    expect(await library('library')).toContainEqual(expect.objectContaining({ id: project, clientId: ACTIVE, folderId: null }))
    expect(await projectRow()).toMatchObject({ client_id: ACTIVE, binned_at: null, canvas_data: { mrec: { layers: [] } } })
    await call(remove, project)
    expect(await library('library')).toEqual([])
    expect(await library('bin')).toContainEqual(expect.objectContaining({ id: project, clientId: ACTIVE }))
    await call(restore, project)
    expect(await library('library')).toContainEqual(expect.objectContaining({ id: project, clientId: ACTIVE }))
    await call(remove, project)
    await db.query('UPDATE banner_projects SET binned_at = now() - interval \'31 days\' WHERE id=$1', [project])
    await expect(call(restore, project)).rejects.toMatchObject({ statusCode: 409 })
    await clearExpiredBannerBin()
    expect(await projectRow()).toBeUndefined()
  })

  it('creates only into an active client, re-checked atomically by the INSERT', async () => {
    const post = (body: Record<string, unknown>) => create({ body, context: {} } as unknown as H3Event)
    expect(await post({ name: 'New', clientId: OTHER, tags: ['launch'] })).toMatchObject({ clientId: OTHER, tags: ['launch'] })
    await db.query('UPDATE agency_clients SET is_active = FALSE WHERE id = $1', [OTHER])
    await expect(post({ name: 'Inactive', clientId: OTHER })).rejects.toMatchObject({ statusCode: 403 })
    await db.query('UPDATE agency_clients SET is_active = TRUE WHERE id = $1', [OTHER])
    adapter.beforeWrite = async () => {
      await db.query('UPDATE agency_clients SET is_active = FALSE WHERE id = $1', [OTHER])
    }
    await expect(post({ name: 'Late', clientId: OTHER })).rejects.toMatchObject({ statusCode: 403 })
    adapter.beforeWrite = undefined
    expect((await db.query('SELECT COUNT(*)::int AS n FROM banner_projects')).rows[0].n).toBe(2)
  })

  it('leaves the legacy SQL path valid and unchanged for non-marketing staff', async () => {
    adapter.user = { id: STAFF, role: 'staff', permissionGroups: ['CREATIVE'] }
    await db.query('UPDATE agency_clients SET is_active = FALSE')
    expect(await call(patch, project, { name: 'Legacy', tags: ['x'] })).toMatchObject({ name: 'Legacy', tags: ['x'] })
    expect(await call(duplicate, project)).toMatchObject({ name: 'Legacy (Copy)' })
    expect(await create({ body: { name: 'Legacy create', clientId: ACTIVE }, context: {} } as unknown as H3Event)).toMatchObject({ clientId: ACTIVE })
    await db.query('UPDATE banner_projects SET review_status = \'approved\' WHERE id = $1', [project])
    await expect(call(remove, project)).rejects.toMatchObject({ statusCode: 403 })
  })
})
