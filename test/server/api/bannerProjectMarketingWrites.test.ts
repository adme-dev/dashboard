import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory banner_projects fake */
const ACTIVE = '11111111-1111-4111-8111-111111111111'
const INACTIVE = '22222222-2222-4222-8222-222222222222'
const OTHER_ACTIVE = '33333333-3333-4333-8333-333333333333'
const PROJECT = '44444444-4444-4444-8444-444444444444'
const STAFF = '55555555-5555-4555-8555-555555555555'
const SHA = `source-sha256:${'a'.repeat(64)}`

const m = vi.hoisted(() => ({
  user: {} as Record<string, any>,
  project: null as Record<string, any> | null,
  clients: new Map<string, boolean>(),
  freshMarketing: true,
  sql: [] as Array<{ sql: string, params: any[] }>
}))

function query(sql: string, params: any[] = []) {
  m.sql.push({ sql, params })
  const p = m.project
  if (sql.includes('SELECT id FROM banner_projects') && sql.includes('FOR UPDATE')) {
    if (!p || params[0] !== p.id || p.client_id !== params[1] || (p.review_status ?? null) !== params[2]) return null
    return p.client_id && !m.clients.get(p.client_id) ? null : { id: p.id }
  }
  if (sql.startsWith('DELETE FROM banner_projects')) {
    m.project = null
    return null
  }
  if (sql.includes('FROM banner_projects WHERE id = $1')) return p && params[0] === p.id ? { ...p } : null
  if (sql.includes('UPDATE banner_projects')) {
    if (!p || params.at(-1) !== p.id) return null
    // Marketing guard predicates: bound to the checked client/review state and an active client.
    if (sql.includes('client_id IS NOT DISTINCT FROM')) {
      const [expectedClient, expectedReview] = params.slice(-3, -1)
      if (p.client_id !== expectedClient || (p.review_status ?? null) !== expectedReview) return null
      if (p.client_id && !m.clients.get(p.client_id)) return null
    }
    const assigned = [...sql.matchAll(/(\w+) = \$(\d+)/g)].filter(([, column]) => ['name', 'client_id', 'canvas_data', 'status', 'thumbnail_url', 'tags'].includes(column!))
    for (const [, column, index] of assigned) p[column!] = column === 'canvas_data' ? JSON.parse(params[Number(index) - 1]) : params[Number(index) - 1]
    return { id: p.id, clientId: p.client_id, tags: p.tags, name: p.name }
  }
  if (sql.includes('INSERT INTO banner_projects')) {
    if (sql.includes('agency_clients') && params[1] && !m.clients.get(params[1])) return null
    return { id: 'copy', name: params[0], clientId: params[1], tags: params[3] }
  }
  if (sql.includes('banner_versions')) return { maxVersion: 0, id: 'version' }
  return null
}

vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn(async () => m.user), requireWriteAccess: vi.fn(async () => m.user) }))
const txDb = { query: async (sql: string, params?: any[]) => ({ rows: [query(sql, params)].filter(Boolean) }) }
vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(async (sql: string, params?: any[]) => query(sql, params)),
  queryOneFresh: vi.fn(async (sql: string, params?: any[]) => query(sql, params)),
  execute: vi.fn(async (sql: string, params?: any[]) => {
    query(sql, params)
    return 1
  }),
  transaction: async (work: (db: typeof txDb) => Promise<unknown>) => work(txDb)
}))
vi.mock('~~/server/utils/banner/godModeProjectCreation', () => ({
  executeGodModeBannerProjectCreation: async (_event: unknown, create: (db: typeof txDb) => Promise<unknown>) => create(txDb)
}))
vi.mock('~~/server/utils/clientScoping', () => ({ hasFreshMarketingManagementPermission: vi.fn(async () => m.freshMarketing) }))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  hasAllSocialClientAccess: (user: any) => ['ADMIN', 'MANAGEMENT'].some(group => user.permissionGroups?.includes(group)),
  requireSocialClientAccess: vi.fn(async (_event: unknown, clientId: string) => {
    if (!clientId) throw Object.assign(new Error('clientId required'), { statusCode: 400 })
    if (m.user.permissionGroups?.includes('MARKETING_MANAGEMENT') && (!m.freshMarketing || !m.clients.get(clientId))) {
      throw Object.assign(new Error('No current access to this client'), { statusCode: 403 })
    }
    return m.user
  })
}))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', (event: any) => event.params.id)
vi.stubGlobal('readBody', async (event: any) => event.body)
vi.stubGlobal('createError', (input: any) => Object.assign(new Error(input.statusMessage), input))

const patch = (await import('~~/server/api/agency/banner-studio/projects/[id].patch')).default as (event: H3Event) => Promise<any>
const duplicate = (await import('~~/server/api/agency/banner-studio/projects/[id]/duplicate.post')).default as (event: H3Event) => Promise<any>
const remove = (await import('~~/server/api/agency/banner-studio/projects/[id].delete')).default as (event: H3Event) => Promise<any>
const create = (await import('~~/server/api/agency/banner-studio/projects/index.post')).default as (event: H3Event) => Promise<any>
const call = (handler: typeof patch, body: Record<string, unknown> = {}) => handler({ params: { id: PROJECT }, body } as unknown as H3Event)
const writes = () => m.sql.filter(entry => /UPDATE banner_projects|INSERT INTO banner_projects|banner_versions/.test(entry.sql))

const marketing = { id: STAFF, role: 'staff', permissionGroups: ['MARKETING_MANAGEMENT'] }
const canvas = { mrec: { layers: [] } }

beforeEach(() => {
  m.user = marketing
  m.project = { id: PROJECT, name: 'Spring', client_id: ACTIVE, canvas_data: { mrec: { layers: [{ id: 'old' }] } }, tags: ['launch'], review_status: null, created_by: 'someone-else' }
  m.clients = new Map([[ACTIVE, true], [INACTIVE, false], [OTHER_ACTIVE, true]])
  m.freshMarketing = true
  m.sql = []
})

describe('browser Banner Studio PATCH for the marketing-management portfolio', () => {
  it('edits an active-client project and binds the write to the checked client and review state', async () => {
    expect(await call(patch, { name: 'Summer', canvasData: canvas })).toMatchObject({ name: 'Summer' })
    const update = m.sql.find(entry => entry.sql.includes('UPDATE banner_projects'))!
    expect(update.sql).toContain('client_id IS NOT DISTINCT FROM')
    expect(update.sql).toContain('agency_clients')
  })

  it('refuses inactive-client and revoked-permission projects before any snapshot or write', async () => {
    m.project!.client_id = INACTIVE
    await expect(call(patch, { canvasData: canvas })).rejects.toMatchObject({ statusCode: 403 })
    m.project!.client_id = ACTIVE
    m.freshMarketing = false
    await expect(call(patch, { name: 'x' })).rejects.toMatchObject({ statusCode: 403 })
    expect(writes()).toHaveLength(0)
  })

  it('refuses an unassigned project the caller did not create', async () => {
    m.project!.client_id = null
    await expect(call(patch, { name: 'x' })).rejects.toMatchObject({ statusCode: 403 })
    m.project!.created_by = STAFF
    expect(await call(patch, { name: 'Mine' })).toMatchObject({ name: 'Mine' })
  })

  it('only moves a project to another active client, never to an inactive one', async () => {
    await expect(call(patch, { clientId: INACTIVE })).rejects.toMatchObject({ statusCode: 403 })
    expect(writes()).toHaveLength(0)
    expect(await call(patch, { clientId: OTHER_ACTIVE })).toMatchObject({ clientId: OTHER_ACTIVE })
  })

  it('fails closed when the client is deactivated between the check and the write', async () => {
    const original = m.clients
    let reads = 0
    m.clients = new Map(original)
    const get = m.clients.get.bind(m.clients)
    m.clients.get = ((id: string) => (id === ACTIVE && ++reads > 1) ? false : get(id)) as never
    await expect(call(patch, { name: 'Late' })).rejects.toMatchObject({ statusCode: 409 })
    expect(m.project!.name).toBe('Spring')
  })

  it('protects in-review and approved artwork, and imported TheBrief canvas and client binding', async () => {
    for (const review of ['in_review', 'approved']) {
      m.project!.review_status = review
      for (const body of [{ canvasData: canvas }, { name: 'x' }, { tags: ['a'] }, { clientId: OTHER_ACTIVE }]) {
        await expect(call(patch, body)).rejects.toMatchObject({ statusCode: 409 })
      }
    }
    m.project!.review_status = null
    m.project!.tags = ['source:thebrief', SHA]
    await expect(call(patch, { canvasData: canvas })).rejects.toMatchObject({ statusCode: 409 })
    await expect(call(patch, { clientId: OTHER_ACTIVE })).rejects.toMatchObject({ statusCode: 409 })
    expect(writes()).toHaveLength(0)
  })

  it('preserves provenance tags exactly and never accepts supplied provenance', async () => {
    m.project!.tags = ['source:thebrief', SHA, 'source-created-date:2020-04-05', 'old']
    await expect(call(patch, { tags: ['source:thebrief'] })).rejects.toMatchObject({ statusCode: 400 })
    await expect(call(patch, { tags: [`source-sha256:${'b'.repeat(64)}`] })).rejects.toMatchObject({ statusCode: 400 })
    await expect(call(patch, { tags: ['source-created-date:2026-10-31'] })).rejects.toMatchObject({ statusCode: 400 })
    await expect(call(patch, { tags: 'not-a-list' })).rejects.toMatchObject({ statusCode: 400 })
    expect(writes()).toHaveLength(0)
    await call(patch, { tags: ['fresh'] })
    expect(m.project!.tags).toEqual(['source:thebrief', SHA, 'source-created-date:2020-04-05', 'fresh'])
  })

  it('keeps the legacy path unchanged for non-marketing staff and all-client roles', async () => {
    for (const user of [{ id: STAFF, role: 'staff', permissionGroups: ['CREATIVE'] }, { id: STAFF, role: 'admin', permissionGroups: ['ADMIN', 'MARKETING_MANAGEMENT'] }]) {
      m.user = user
      m.sql = []
      m.project!.client_id = INACTIVE
      m.project!.review_status = 'approved'
      expect(await call(patch, { name: 'Legacy' })).toMatchObject({ name: 'Legacy' })
      const update = m.sql.find(entry => entry.sql.includes('UPDATE banner_projects'))!
      expect(update.sql).not.toContain('IS NOT DISTINCT FROM')
    }
  })
})

describe('browser Banner Studio duplicate for the marketing-management portfolio', () => {
  it('copies an active-client project into the same client without import provenance', async () => {
    m.project!.tags = ['source:thebrief', SHA, 'launch']
    m.project!.review_status = 'approved'
    expect(await call(duplicate)).toMatchObject({ clientId: ACTIVE, tags: ['launch'] })
    const insert = m.sql.find(entry => entry.sql.includes('INSERT INTO banner_projects'))!
    expect(insert.sql).toContain('agency_clients')
  })

  it('refuses inactive or inaccessible sources and fails closed if the client deactivates before insert', async () => {
    m.project!.client_id = INACTIVE
    await expect(call(duplicate)).rejects.toMatchObject({ statusCode: 403 })
    m.project!.client_id = null
    await expect(call(duplicate)).rejects.toMatchObject({ statusCode: 403 })
    expect(writes()).toHaveLength(0)
    m.project!.client_id = ACTIVE
    let reads = 0
    const get = m.clients.get.bind(m.clients)
    m.clients.get = ((id: string) => (id === ACTIVE && ++reads > 1) ? false : get(id)) as never
    await expect(call(duplicate)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('keeps legacy duplication (including provenance) for non-marketing staff', async () => {
    m.user = { id: STAFF, role: 'staff', permissionGroups: ['CREATIVE'] }
    m.project!.tags = ['source:thebrief', SHA]
    expect(await call(duplicate)).toMatchObject({ tags: ['source:thebrief', SHA] })
  })
})

describe('browser Banner Studio delete for the marketing-management portfolio', () => {
  it('deletes an active-client draft under a lock bound to the checked state', async () => {
    expect(await call(remove)).toEqual({ success: true, message: 'Project deleted' })
    expect(m.project).toBeNull()
  })

  it('refuses inactive or inaccessible projects and protected artwork without deleting', async () => {
    m.project!.client_id = INACTIVE
    await expect(call(remove)).rejects.toMatchObject({ statusCode: 403 })
    m.project!.client_id = null
    await expect(call(remove)).rejects.toMatchObject({ statusCode: 403 })
    m.project!.client_id = ACTIVE
    for (const over of [{ review_status: 'in_review' }, { review_status: 'approved' }, { tags: ['source:thebrief', SHA] }]) {
      Object.assign(m.project!, { review_status: null, tags: ['launch'] }, over)
      await expect(call(remove)).rejects.toMatchObject({ statusCode: 409 })
    }
    expect(m.project).not.toBeNull()
    expect(m.sql.some(entry => entry.sql.startsWith('DELETE'))).toBe(false)
  })

  it('fails closed when the client is deactivated before the locked delete', async () => {
    let reads = 0
    const get = m.clients.get.bind(m.clients)
    m.clients.get = ((id: string) => (id === ACTIVE && ++reads > 1) ? false : get(id)) as never
    await expect(call(remove)).rejects.toMatchObject({ statusCode: 409 })
    expect(m.project).not.toBeNull()
  })

  it('keeps legacy deletion for non-marketing staff', async () => {
    m.user = { id: STAFF, role: 'staff', permissionGroups: ['CREATIVE'] }
    m.project!.review_status = 'approved'
    expect(await call(remove)).toMatchObject({ success: true })
  })
})

describe('browser Banner Studio create for the marketing-management portfolio', () => {
  const post = (body: Record<string, unknown>) => create({ params: {}, body } as unknown as H3Event)

  it('creates only for an active client, re-checked by the INSERT', async () => {
    expect(await post({ name: 'New', clientId: ACTIVE })).toMatchObject({ clientId: ACTIVE })
    expect(m.sql.find(entry => entry.sql.includes('INSERT INTO banner_projects'))!.sql).toContain('agency_clients')
    await expect(post({ name: 'New', clientId: INACTIVE })).rejects.toMatchObject({ statusCode: 403 })
    let reads = 0
    const get = m.clients.get.bind(m.clients)
    m.clients.get = ((id: string) => (id === ACTIVE && ++reads > 1) ? false : get(id)) as never
    await expect(post({ name: 'Late', clientId: ACTIVE })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses reserved provenance labels outside a TheBrief import and requires fresh permission when unassigned', async () => {
    await expect(post({ name: 'New', clientId: ACTIVE, tags: ['source:manual'] })).rejects.toMatchObject({ statusCode: 400 })
    m.freshMarketing = false
    await expect(post({ name: 'Unassigned' })).rejects.toMatchObject({ statusCode: 403 })
    m.freshMarketing = true
    expect(await post({ name: 'Unassigned' })).toMatchObject({ clientId: null })
  })

  it('keeps legacy creation (no client check) for non-marketing staff', async () => {
    m.user = { id: STAFF, role: 'staff', permissionGroups: ['CREATIVE'] }
    expect(await post({ name: 'Legacy', clientId: INACTIVE })).toMatchObject({ clientId: INACTIVE })
    expect(m.sql.find(entry => entry.sql.includes('INSERT INTO banner_projects'))!.sql).toContain('VALUES ($1, $2, $3, $4, $5, $6)')
  })
})

it('retains the source folder when copying protected artwork without carrying its provenance', async () => {
  m.project!.folder_id = '632a71d5-cd2c-4d9f-812d-e3f70bb6c241'
  m.project!.tags = ['source:thebrief', 'source-folder:JAC', 'social']
  await call(duplicate)
  const insert = m.sql.find(entry => entry.sql.includes('INSERT INTO banner_projects'))!
  expect(insert.params[5]).toBe(m.project!.folder_id)
  expect(insert.params[3]).toEqual(['source-folder:JAC', 'social'])
})
