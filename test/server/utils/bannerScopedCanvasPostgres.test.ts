import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile, realpath } from 'node:fs/promises'
import pg from 'pg'
const m = vi.hoisted(() => ({ tx: vi.fn(), one: vi.fn(), rows: vi.fn(), auth: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: m.tx, queryOneFresh: m.one, queryOne: m.one, queryRowsFresh: m.rows, execute: m.rows }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: m.auth, requireWriteAccess: m.auth }))
vi.mock('~~/server/utils/email-marketing/access', () => ({ resolveEmailClientScope: async () => null, addEmailClientScopeCondition: () => {} }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: async () => {}, hasAllSocialClientAccess: () => false, hasSocialClientPermission: () => true }))
vi.mock('~~/server/utils/banner/platformQrCanvas', () => ({ validateBannerPlatformQrCanvas: async () => {} }))
vi.mock('~~/server/utils/banner/godModeProjectCreation', () => ({ executeGodModeBannerProjectCreation: async (_event: any, fn: any) => m.tx(fn) }))
vi.mock('~~/server/utils/banner/thebriefProjectImport', () => ({ readTheBriefProjectIdentity: () => null, findExistingTheBriefProject: async () => null }))
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('getRouterParam', (event: any) => event.id)
vi.stubGlobal('getQuery', (event: any) => event.query || {})
vi.stubGlobal('readBody', (event: any) => event.body)
vi.stubGlobal('setHeader', vi.fn())
import { assertScopedCanvasAccess, withScopedCanvasAccess } from '../../../server/utils/banner/scopedCanvasAccess'
import { scopedDissectionAssetKey, scopedDissectionAssetLocator } from '../../../shared/bannerDissectionDelivery'
const copy = (await import('../../../server/api/agency/banner-studio/projects/[id]/duplicate.post')).default
const update = (await import('../../../server/api/agency/banner-studio/projects/[id].patch')).default
const create = (await import('../../../server/api/agency/banner-studio/projects/index.post')).default
const snapshot = (await import('../../../server/api/agency/banner-studio/versions/index.post')).default
const remove = (await import('../../../server/api/agency/banner-studio/projects/[id].delete')).default
const list = (await import('../../../server/api/agency/banner-studio/projects/index.get')).default
const emailAssets = (await import('../../../server/api/agency/email/assets/index.get')).default
const mint = (await import('../../../server/api/agency/banner-studio/links/index.post')).default
const actor = '11111111-1111-4111-8111-111111111111'
const client = '22222222-2222-4222-8222-222222222222'
const project = '33333333-3333-4333-8333-333333333333'
const job = '44444444-4444-4444-8444-444444444444'
const asset = '55555555-5555-4555-8555-555555555555'
const attempt = '66666666-6666-4666-8666-666666666666'
const other = '77777777-7777-4777-8777-777777777777'
const role = '88888888-8888-4888-8888-888888888888'
const source = { version: 1, mimeType: 'image/png', byteLength: 10, sha256: 'a'.repeat(64), width: 1, height: 1 }
const entry = { assetId: asset, attemptId: attempt, key: scopedDissectionAssetKey(job, attempt, asset), mimeType: 'image/png', byteLength: 10, sha256: 'b'.repeat(64) }
const manifest = { source, ingestion: { version: 1, owner: { kind: 'project', userId: actor, projectId: project, projectOwnerId: actor, clientId: client }, physical: null, ingestedAt: '2026-10-27T12:00:00.000Z', sessionsInvalidatedAt: null }, delivery: { version: 1, assets: { [asset]: entry } } }
const canvas = { square: { dissectionSource: { jobId: job, sourceSha256: source.sha256 }, layers: [{ type: 'image', src: scopedDissectionAssetLocator(job, asset) }, { type: 'text', text: 'Protected copy' }] } }
const event = (body = {}, id = project) => ({ id, body, query: {} }) as any

describe.skipIf(!process.env.BANNER_CANVAS_PROOF_URL)('scoped canvas transactions on owned PostgreSQL', () => {
  let pool: pg.Pool
  const query = (sql: string, params?: unknown[]) => pool.query(sql, params)
  beforeAll(async () => {
    const url = new URL(process.env.BANNER_CANVAS_PROOF_URL!)
    const root = await realpath(process.env.BANNER_CANVAS_PROOF_ROOT!)
    if (url.hostname !== '127.0.0.1' || !root.startsWith('/private/tmp/banner-canvas-proof-')) throw new Error('Not an owned proof')
    const owner = JSON.parse(await readFile(`${root}/owner.json`, 'utf8'))
    if (owner.token !== process.env.BANNER_CANVAS_PROOF_TOKEN || owner.url !== url.toString()) throw new Error('Wrong cluster ownership')
    pool = new pg.Pool({ connectionString: url.toString(), max: 4 })
    if (await realpath((await query('SHOW data_directory')).rows[0].data_directory) !== `${root}/data`) throw new Error('Wrong data directory')
    const base = await readFile(new URL('../../../server/database/schema.sql', import.meta.url), 'utf8')
    const auth = await readFile(new URL('../../../server/database/schema-auth.sql', import.meta.url), 'utf8')
    await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    for (const table of ['team_members', 'agency_clients']) await query(base.match(new RegExp(`CREATE TABLE ${table} \\([\\s\\S]*?\\n\\);`))![0])
    await query(auth.match(/CREATE TYPE user_role AS ENUM \([^;]+;/)![0])
    await query(auth.match(/ALTER TABLE team_members ADD COLUMN IF NOT EXISTS user_role[^;]+;/)![0])
    for (const file of ['061-user-roles-expansion.sql', '062-custom-roles-permissions.sql', '064-client-team-assignments.sql', '191_session_invalidation.sql', '026-banner-studio.sql', '031-banner-comments.sql', '034-banner-dissector.sql', '167-email-client-scoped-assets.sql']) {
      await query(await readFile(new URL(`../../../server/database/migrations/${file}`, import.meta.url), 'utf8'))
    }
    m.tx.mockImplementation(async fn => {
      const db = await pool.connect()
      try { await db.query('BEGIN'); const result = await fn(db); await db.query('COMMIT'); return result }
      catch (error) { await db.query('ROLLBACK'); throw error }
      finally { db.release() }
    })
    m.one.mockImplementation(async (sql, params) => (await query(sql, params)).rows[0] ?? null)
    m.rows.mockImplementation(async (sql, params) => (await query(sql, params)).rows)
  }, 15000)
  beforeEach(async () => {
    await query('TRUNCATE team_members, agency_clients CASCADE')
    await query(`INSERT INTO custom_roles(id,name,slug,is_system,is_read_only) VALUES($1,'Creative','creative',TRUE,FALSE)`, [role])
    await query(`INSERT INTO role_permission_groups(role_id,permission_group) VALUES($1,'CREATIVE')`, [role])
    await query(`INSERT INTO team_members(id,name,email,user_role,custom_role_id) VALUES($1,'Uploader','uploader@example.invalid','creative',$3),($2,'Other','other@example.invalid','creative',$3)`, [actor, other, role])
    await query(`INSERT INTO agency_clients(id,name,billing_type) VALUES($1,'Synthetic client','project')`, [client])
    await query('INSERT INTO client_team_assignments(client_id,team_member_id) VALUES($1,$2),($1,$3)', [client, actor, other])
    await query(`INSERT INTO banner_projects(id,name,client_id,created_by,canvas_data) VALUES($1,'Synthetic project',$2,$3,$4)`, [project, client, actor, JSON.stringify(canvas)])
    await query(`INSERT INTO banner_dissections(job_id,user_id,project_id,source_r2_key,manifest) VALUES($1,$2,$3,'synthetic-private-source',$4)`, [job, actor, project, JSON.stringify(manifest)])
    await query(`INSERT INTO banner_assets(id,name,mime_type,file_size,r2_key,url,uploaded_by,client_id) VALUES($1,'Synthetic image','image/png',10,$2,$3,$4,$5)`, [asset, entry.key, scopedDissectionAssetLocator(job, asset), actor, client])
    m.auth.mockResolvedValue({ id: actor })
  })
  afterAll(async () => { await pool?.end() })
  it('excludes protected email catalogue rows before LIMIT, preserving older legacy images', async () => {
    await query(`INSERT INTO banner_assets(name,mime_type,file_size,r2_key,url,uploaded_by,client_id,created_at)
      SELECT 'Protected '||n,'image/png',10,'scoped-dissection-assets/synthetic/'||n,
      '/api/agency/banner-studio/dissect/synthetic/assets/'||n,$1,$2,NOW()+interval '1 minute'
      FROM generate_series(1,125) n`, [actor, client])
    await query(`INSERT INTO banner_assets(id,name,mime_type,file_size,r2_key,url,uploaded_by,client_id,created_at)
      VALUES($1,'Legacy image','image/png',10,'banner-assets/legacy.png','/api/public/banner-assets/token',$2,$3,NOW()-interval '1 minute')`, [other, actor, client])
    const response = await emailAssets(event())
    expect(response.assets.map((asset: any) => asset.id)).toEqual([other])
  })
  it('authorizes persisted source and exact registry/asset identity', async () => {
    await expect(assertScopedCanvasAccess(actor, canvas, project)).resolves.toBeUndefined()
    await query(`UPDATE banner_assets SET r2_key='banner-assets/forged' WHERE id=$1`, [asset])
    await expect(assertScopedCanvasAccess(actor, canvas, project)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each(['colleague', 'session', 'malformed', 'malformed-source'])('preserves list slots and redacts all private content after %s denial', async reason => {
    if (reason === 'colleague') m.auth.mockResolvedValue({ id: other })
    if (reason === 'session') await query('UPDATE team_members SET sessions_invalidated_at=NOW() WHERE id=$1', [actor])
    if (reason === 'malformed') await query('UPDATE banner_projects SET canvas_data=$2 WHERE id=$1', [project, JSON.stringify({ square: { layers: [{ src: 'a%2Fbanner-studio%2Fdissect%2Fx.png', text: 'Private' }] } })])
    if (reason === 'malformed-source') await query(`UPDATE banner_dissections SET manifest='{"ingestion":null}' WHERE job_id=$1`, [job])
    await query(`UPDATE banner_projects SET thumbnail_url='https://private.example/source.png' WHERE id=$1`, [project])
    await query(`INSERT INTO banner_projects(id,name,client_id,created_by,canvas_data,updated_at)
      VALUES($1,'Ordinary project',$2,$3,'{}',NOW()-interval '1 minute')`, [other, client, actor])
    const result = await list({ query: { limit: '2' } } as any)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ id: project, name: 'Restricted artwork', status: 'restricted', restricted: true })
    expect(result[1]).toMatchObject({ id: other, name: 'Ordinary project', canvasData: {} })
    const nextPage = await list({ query: { limit: '1', offset: '1' } } as any)
    expect(nextPage.map(row => row.id)).toEqual([other])
    await expect(assertScopedCanvasAccess(reason === 'colleague' ? other : actor,
      (await query('SELECT canvas_data FROM banner_projects WHERE id=$1', [project])).rows[0].canvas_data, project))
      .rejects.toMatchObject({ statusCode: 403 })
  })
  it('does not let a source-denied colleague recover the hidden name or use wildcards through search', async () => {
    m.auth.mockResolvedValue({ id: other })
    const probe = async (search: string) => list({ query: { search, limit: '5' } } as any)
    expect(await probe('Synthetic proj')).toEqual([])
    expect(await probe('Synthetic proj')).toEqual(await probe('Zzzzzzzzz proj'))
    expect(await probe('%')).toEqual([])
    expect(await probe('_')).toEqual([])
    expect(await probe('RESTRICTED')).toEqual([{ id: project, name: 'Restricted artwork', status: 'restricted', restricted: true }])
    m.auth.mockResolvedValue({ id: actor })
    expect((await probe('synthetic PROJ')).map((row: any) => row.id)).toEqual([project])
  })
  it('copies canonical locators and source markers without thumbnail or registry rebinding', async () => {
    const result = await copy(event())
    expect(result.canvasData).toEqual(canvas)
    expect(result.thumbnailUrl).toBeNull()
    expect((await query('SELECT manifest FROM banner_dissections WHERE job_id=$1', [job])).rows[0].manifest).toEqual(manifest)
  })
  it('creates protected project in the same client scope', async () => {
    const result = await create(event({ name: 'Protected new', clientId: client, canvasData: canvas }))
    expect(result.canvasData).toEqual(canvas)
    expect(result.clientId).toBe(client)
    expect(result.thumbnailUrl).toBeNull()
  })
  it('preserves omitted editor markers and atomically snapshots before saving', async () => {
    const next: any = structuredClone(canvas); delete next.square.dissectionSource
    next.square.layers[1].text = 'Edited copy'
    const result = await update(event({ canvasData: next }))
    expect(result.canvasData.square.dissectionSource).toEqual(canvas.square.dissectionSource)
    expect(result.canvasData.square.layers[1].text).toBe('Edited copy')
    expect((await query('SELECT canvas_data FROM banner_versions WHERE project_id=$1', [project])).rows[0].canvas_data).toEqual(canvas)
  })
  it('creates protected named snapshots with retained canonical references', async () => {
    const result = await snapshot(event({ projectId: project, label: 'Protected snapshot', canvasData: canvas }))
    expect((await query('SELECT canvas_data FROM banner_versions WHERE id=$1', [result.id])).rows[0].canvas_data).toEqual(canvas)
  })
  it.each(['assignment', 'session', 'readonly'])('denies copy/snapshot/save after %s revocation without writes', async reason => {
    if (reason === 'assignment') await query('DELETE FROM client_team_assignments WHERE team_member_id=$1', [actor])
    if (reason === 'session') await query('UPDATE team_members SET sessions_invalidated_at=NOW() WHERE id=$1', [actor])
    if (reason === 'readonly') await query('UPDATE custom_roles SET is_read_only=TRUE WHERE id=$1', [role])
    for (const [handler, body] of [[copy, {}], [update, { name: 'Forbidden edit' }], [snapshot, { projectId: project, canvasData: canvas }]] as const) {
      await expect(handler(event(body))).rejects.toMatchObject({ statusCode: 403 })
    }
    expect((await query('SELECT COUNT(*)::int AS count FROM banner_projects')).rows[0].count).toBe(1)
    expect((await query('SELECT COUNT(*)::int AS count FROM banner_versions')).rows[0].count).toBe(0)
  })
  it('rolls back callback mutations and does not retry failures', async () => {
    let calls = 0
    await expect(withScopedCanvasAccess(actor, canvas, project, 'write', async db => {
      calls++
      await db.query(`UPDATE banner_projects SET name='must rollback' WHERE id=$1`, [project])
      throw new Error('synthetic uncertainty')
    })).rejects.toThrow('synthetic uncertainty')
    expect(calls).toBe(1)
    expect((await query('SELECT name FROM banner_projects WHERE id=$1', [project])).rows[0].name).toBe('Synthetic project')
  })
  it('holds assignment authority across the transaction callback, then observes revocation', async () => {
    await withScopedCanvasAccess(actor, canvas, project, 'write', async () => {
      const contender = await pool.connect()
      try {
        await contender.query('BEGIN')
        await contender.query("SET LOCAL lock_timeout='80ms'")
        await expect(contender.query('DELETE FROM client_team_assignments WHERE team_member_id=$1', [actor])).rejects.toMatchObject({ code: '55P03' })
      } finally { await contender.query('ROLLBACK'); contender.release() }
    })
    await query('DELETE FROM client_team_assignments WHERE team_member_id=$1', [actor])
    await expect(assertScopedCanvasAccess(actor, canvas, project)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('serializes opposite-order multi-source mutations without deadlock', async () => {
    await query(`INSERT INTO banner_dissections(job_id,user_id,source_r2_key,manifest) VALUES($1,$2,'second-synthetic-source',$3)`, [other, actor, JSON.stringify(manifest)])
    const first = { a: { dissectionSource: { jobId: job, sourceSha256: source.sha256 } }, b: { dissectionSource: { jobId: other, sourceSha256: source.sha256 } } }
    const reversed = { b: first.b, a: first.a }
    const results = await Promise.all([first, reversed].map(value => withScopedCanvasAccess(actor, value, project, 'write', async db => {
      await db.query('UPDATE banner_projects SET name = name || $1 WHERE id=$2', ['!', project])
      return true
    })))
    expect(results).toEqual([true, true])
  })
  it('concurrent PATCH and project deletion settle with a revision/access denial instead of deadlock', async () => {
    const results = await Promise.allSettled([update(event({ name: 'Concurrent save' })), remove(event())])
    expect(results.some(result => result.status === 'fulfilled')).toBe(true)
    for (const result of results) if (result.status === 'rejected') {
      expect([403, 404, 409]).toContain(result.reason.statusCode)
      expect(result.reason.code).not.toBe('40P01')
    }
    expect((await query('SELECT manifest FROM banner_dissections WHERE job_id=$1', [job])).rows[0].manifest).toEqual(manifest)
  })
  it('serializes concurrent deletes of a job-less project on its row lock instead of deadlocking on FOR SHARE upgrade', async () => {
    const target = '99999999-9999-4999-8999-999999999999'
    await query(`INSERT INTO banner_projects(id,name,client_id,created_by,canvas_data) VALUES($1,'Job-less project',$2,$3,'{}')`, [target, client, actor])
    // Hold each transaction just after its project FOR SHARE until both arrive
    // (or 400 ms pass). Pre-fix both then upgrade to FOR UPDATE and PostgreSQL
    // aborts one with 40P01; post-fix the second waits on the up-front row lock.
    let arrived = 0
    let release!: () => void
    const both = new Promise<void>(resolve => { release = resolve })
    const transaction = m.tx.getMockImplementation()!
    const held = (fn: any) => transaction((db: pg.PoolClient) => fn({ query: async (sql: string, params: unknown[]) => {
      const result = await db.query(sql, params)
      if (/FROM banner_projects WHERE id = \$1 FOR SHARE/.test(sql)) {
        if (++arrived >= 2) release()
        await Promise.race([both, new Promise(resolve => setTimeout(resolve, 400))])
      }
      return result
    } }))
    m.tx.mockImplementationOnce(held).mockImplementationOnce(held)
    const results = await Promise.allSettled([remove(event({}, target)), remove(event({}, target))])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason.code).not.toBe('40P01')
    expect(rejected.reason.statusCode).toBe(404)
    expect((await query('SELECT id FROM banner_projects WHERE id=$1', [target])).rows).toEqual([])
  })
  it('creates a public review link only for freshly authorized unprotected content', async () => {
    await query("UPDATE banner_projects SET canvas_data='{}' WHERE id=$1", [project])
    const link = await mint(event({ projectId: project }))
    expect(link.projectId).toBe(project)
    expect(link.token).toMatch(/^[a-f0-9]{32}$/)
    await query('UPDATE custom_roles SET is_read_only=TRUE WHERE id=$1', [role])
    await expect(mint(event({ projectId: project }))).rejects.toMatchObject({ statusCode: 403 })
    expect((await query('SELECT COUNT(*)::int AS count FROM banner_review_links')).rows[0].count).toBe(1)
  })
  it('deletes a project while retaining source, ingestion and registry and clearing only import destination', async () => {
    await expect(remove(event())).resolves.toMatchObject({ success: true })
    const retained = (await query('SELECT project_id,manifest FROM banner_dissections WHERE job_id=$1', [job])).rows[0]
    expect(retained).toEqual({ project_id: null, manifest })
    await expect(assertScopedCanvasAccess(actor, canvas)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each(['colleague', 'session', 'malformed', 'malformed-source'])('allows current target write authority to clean up %s source denial', async reason => {
    if (reason === 'colleague') m.auth.mockResolvedValue({ id: other })
    if (reason === 'session') await query('UPDATE team_members SET sessions_invalidated_at=NOW() WHERE id=$1', [actor])
    if (reason === 'malformed') await query('UPDATE banner_projects SET canvas_data=$2 WHERE id=$1', [project, JSON.stringify({ square: { layers: [{ src: 'scoped-banner-exports/x.png' }] } })])
    if (reason === 'malformed-source') await query(`UPDATE banner_dissections SET manifest='{"source":null,"ingestion":null,"delivery":{"unchanged":true}}' WHERE job_id=$1`, [job])
    const before = (await query('SELECT source_r2_key,manifest FROM banner_dissections WHERE job_id=$1', [job])).rows[0]
    const assetBefore = (await query('SELECT * FROM banner_assets WHERE id=$1', [asset])).rows[0]
    await expect(remove(event())).resolves.toMatchObject({ success: true })
    expect((await query('SELECT id FROM banner_projects WHERE id=$1', [project])).rows).toEqual([])
    expect((await query('SELECT project_id,source_r2_key,manifest FROM banner_dissections WHERE job_id=$1', [job])).rows[0])
      .toEqual({ project_id: null, ...before })
    expect((await query('SELECT * FROM banner_assets WHERE id=$1', [asset])).rows[0]).toEqual(assetBefore)
  })
  it.each(['assignment', 'readonly', 'inactive'])('denies cleanup after current target %s revocation', async reason => {
    if (reason === 'assignment') await query('DELETE FROM client_team_assignments WHERE team_member_id=$1', [actor])
    if (reason === 'readonly') await query('UPDATE custom_roles SET is_read_only=TRUE WHERE id=$1', [role])
    if (reason === 'inactive') await query('UPDATE team_members SET is_active=FALSE WHERE id=$1', [actor])
    await expect(remove(event())).rejects.toMatchObject({ statusCode: 403 })
    expect((await query('SELECT id FROM banner_projects WHERE id=$1', [project])).rows).toHaveLength(1)
    expect((await query('SELECT project_id,manifest FROM banner_dissections WHERE job_id=$1', [job])).rows[0]).toEqual({ project_id: project, manifest })
  })
  it('rejects an import committed after job selection and preserves both registries', async () => {
    const transaction = m.tx.getMockImplementation()!
    m.tx.mockImplementationOnce(fn => transaction(async (db: pg.PoolClient) => fn({ query: async (sql: string, params: unknown[]) => {
      const result = await db.query(sql, params)
      if (sql.includes('FROM banner_dissections') && sql.includes('ORDER BY job_id FOR UPDATE')) {
        await query(`INSERT INTO banner_dissections(job_id,user_id,project_id,source_r2_key,manifest)
          VALUES($1,$2,$3,'second-source',$4)`, [other, actor, project, JSON.stringify(manifest)])
      }
      return result
    } })))
    await expect(remove(event())).rejects.toMatchObject({ statusCode: 409 })
    expect((await query('SELECT id FROM banner_projects WHERE id=$1', [project])).rows).toHaveLength(1)
    expect((await query('SELECT project_id,manifest FROM banner_dissections ORDER BY job_id')).rows)
      .toEqual([{ project_id: project, manifest }, { project_id: project, manifest }])
  })
  it('rejects a project snapshot changed between preflight and transaction', async () => {
    const transaction = m.tx.getMockImplementation()!
    m.tx.mockImplementationOnce(async fn => {
      await query(`UPDATE banner_projects SET canvas_data='{}',updated_at=NOW()+interval '1 minute' WHERE id=$1`, [project])
      return transaction(fn)
    })
    await expect(remove(event())).rejects.toMatchObject({ statusCode: 409 })
    expect((await query('SELECT project_id,manifest FROM banner_dissections WHERE job_id=$1', [job])).rows[0]).toEqual({ project_id: project, manifest })
  })
})
