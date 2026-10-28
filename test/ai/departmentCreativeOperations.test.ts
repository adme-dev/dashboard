import { beforeEach, describe, expect, it, vi } from 'vitest'

/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory SQL fake rows */
type Row = Record<string, any>
const h = vi.hoisted(() => ({
  state: {} as Record<string, any>,
  sql: [] as string[],
  deny: false,
  readOnly: false,
  denyAfter: Infinity,
  authorityCalls: 0
}))

function blankState() {
  return {
    ledger: new Map<string, Row>(),
    clients: new Map<string, boolean>(),
    projects: [] as Row[],
    versions: [] as Row[],
    templates: [] as Row[],
    assets: [] as Row[],
    jobs: [] as Row[]
  }
}
const active = (id: string) => h.state.clients.get(id) === true

function query(sql: string, p: any[] = []): { rows: Row[], rowCount: number } {
  h.sql.push(sql)
  const s = h.state
  const out = (rows: Row[]) => ({ rows, rowCount: rows.length })
  if (sql.includes('INSERT INTO god_mode_execution_ledger')) {
    const key = `${p[0]}|${p[1]}`
    if (s.ledger.has(key)) return out([])
    s.ledger.set(key, { state: 'in_progress', route_or_tool: p[3], client_id: p[6], result_reference: p[7], execution_metadata: null })
    return out([{ state: 'in_progress' }])
  }
  if (sql.includes('FROM god_mode_execution_ledger')) return out([s.ledger.get(`${p[0]}|${p[1]}`)].filter(Boolean))
  if (sql.includes('UPDATE god_mode_execution_ledger')) {
    const row = s.ledger.get(`${p[0]}|${p[1]}`)
    if (!row || row.state !== 'in_progress') return out([])
    Object.assign(row, { state: p[2], execution_metadata: JSON.parse(p[5]) })
    return { rows: [], rowCount: 1 }
  }
  if (sql.includes('FROM banner_projects p') && sql.includes('JOIN agency_clients c')) {
    const byId = sql.includes('p.id = $1')
    return out(s.projects.filter((r: Row) => active(r.client_id) && (byId ? r.id === p[0] && r.client_id === p[1] : r.client_id === p[0])))
  }
  if (sql.includes('INSERT INTO banner_projects')) {
    const row = { id: `00000000-0000-4000-8000-${String(s.projects.length + 1).padStart(12, '0')}`, name: p[0], client_id: p[1], canvas_data: JSON.parse(p[2]), tags: p[3], status: 'draft', review_status: 'draft', created_by: p[4] }
    s.projects.push(row)
    return out([row])
  }
  if (sql.includes('UPDATE banner_projects SET')) {
    const row = s.projects.find((r: Row) => r.id === p[0] && r.client_id === p[1])
    if (!row) return out([])
    for (const [, column, index] of sql.matchAll(/(name|canvas_data|tags) = \$(\d+)/g)) {
      const value = p[Number(index) - 1]
      row[column] = column === 'canvas_data' ? JSON.parse(value) : value
    }
    return out([row])
  }
  if (sql.includes('INSERT INTO banner_versions')) {
    s.versions.push({ project_id: p[0], canvas_data: JSON.parse(p[1]) })
    return out([])
  }
  if (sql.includes('FROM banner_templates') && sql.includes('FOR UPDATE')) return out(s.templates.filter((t: Row) => t.id === p[0]))
  if (sql.includes('UPDATE banner_templates')) {
    for (const t of s.templates.filter((t: Row) => t.id === p[0])) t.usage_count = (t.usage_count ?? 0) + 1
    return out([])
  }
  if (sql.includes('FROM banner_templates t')) return out(s.templates)
  if (sql.includes('FROM banner_assets a')) return out(s.assets.filter((a: Row) => a.client_id === p[0] && active(a.client_id)))
  if (sql.includes('FROM banner_render_jobs j JOIN banner_projects p')) {
    return out(s.jobs.filter((j: Row) => p[0].includes(j.id) && j.project_id === p[2] && s.projects.some((r: Row) => r.id === j.project_id && r.client_id === p[1])))
  }
  return out([])
}
async function tx<T>(fn: (db: unknown) => Promise<T>): Promise<T> {
  const snapshot = structuredClone({ ...h.state, ledger: [...h.state.ledger] })
  try {
    return await fn({ query: async (sql: string, p?: any[]) => query(sql, p) })
  } catch (error) {
    Object.assign(h.state, { ...snapshot, ledger: new Map(snapshot.ledger) })
    throw error
  }
}

vi.mock('~~/server/utils/db', () => ({
  queryRowsFresh: async (sql: string, p?: any[]) => query(sql, p).rows,
  transaction: tx
}))
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({
  requireMarketingDepartment: vi.fn(async (ctx: Row, write: boolean) => {
    h.authorityCalls++
    if (h.deny || h.authorityCalls > h.denyAfter) throw Object.assign(new Error('revoked'), { statusCode: 403 })
    if (write && h.readOnly) throw Object.assign(new Error('read-only'), { statusCode: 403 })
    return { ...ctx }
  })
}))
vi.mock('~~/server/utils/ai/marketing/readScope', () => ({
  resolveMarketingReadScope: vi.fn(async () => ({})),
  requireScopedClient: vi.fn(async (_scope: unknown, clientId: string) => {
    if (!active(clientId)) throw Object.assign(new Error('nf'), { statusCode: 404 })
  })
}))

const { runDepartmentCreativeOperation, bannerRevisionOf } = await import('~~/server/utils/ai/marketing/departmentCreativeOperations')
const { departmentCreativeTools } = await import('~~/server/utils/ai/mcp/departmentCreativeTools')

const CLIENT = '11111111-1111-4111-8111-111111111111'
const OTHER = '33333333-3333-4333-8333-333333333333'
const INACTIVE = '44444444-4444-4444-8444-444444444444'
const ACTOR = '22222222-2222-4222-8222-222222222222'
const P1 = '55555555-5555-4555-8555-555555555555'
const P_OTHER = '66666666-6666-4666-8666-666666666666'
const P_IMPORT = '77777777-7777-4777-8777-777777777777'
const P_REVIEW = '88888888-8888-4888-8888-888888888888'
const TEMPLATE = '99999999-9999-4999-8999-999999999999'
const JOB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DIGEST = 'f'.repeat(64)
let n = 0
const key = () => `mcp:${(++n).toString(16).padStart(64, '0')}`
const ctx = { userId: ACTOR, userRole: 'staff', source: 'mcp', event: { context: {} } } as never
const canvas = (headline = 'Hello') => ({ mrec: { bgColor: '#000000', layers: [{ id: 1, type: 'text', text: headline, x: 0, y: 0, w: 300, h: 250, startTime: 0, endTime: 4 }] } })
const project = (over: Row = {}): Row => ({ id: P1, name: 'Spring', client_id: CLIENT, canvas_data: canvas(), tags: ['spring'], status: 'draft', review_status: 'draft', created_by: ACTOR, ...over })
const rev = (id: string) => bannerRevisionOf(h.state.projects.find((r: Row) => r.id === id))
const run = (name: string, args: Row, k?: string, deps?: Row) => runDepartmentCreativeOperation(name, args, ctx, k, k ? DIGEST : undefined, deps as never)

function enqueueDouble(options: { failAfterDispatch?: boolean } = {}) {
  const calls: Row[] = []
  const enqueue = vi.fn(async (input: Row, deps: Row) => {
    calls.push(input)
    await deps.insertJob({ id: JOB })
    await deps.sendQueue({ jobId: JOB })
    return { jobIds: [JOB] }
  })
  const buildEnqueueDeps = vi.fn((_event: unknown, opts: Row) => ({
    genId: opts.genId,
    putSourceHtml: async () => undefined,
    insertJob: async () => undefined,
    sendQueue: async () => {
      await opts.markDispatched()
      if (options.failAfterDispatch) throw new Error('queue rejected')
    }
  }))
  return { enqueue, buildEnqueueDeps, calls }
}

beforeEach(() => {
  h.state = blankState()
  h.sql = []
  Object.assign(h, { deny: false, readOnly: false, denyAfter: Infinity, authorityCalls: 0 })
  h.state.clients.set(CLIENT, true).set(OTHER, true).set(INACTIVE, false)
  h.state.projects.push(
    project(),
    project({ id: P_OTHER, client_id: OTHER, name: 'Other client' }),
    project({ id: P_IMPORT, tags: ['source:thebrief', `source-sha256:${'a'.repeat(64)}`, 'campaign'] }),
    project({ id: P_REVIEW, review_status: 'in_review' })
  )
  h.state.templates.push({ id: TEMPLATE, name: 'Sale', category: 'retail', canvas_data: canvas('Sale'), usage_count: 0, is_system: true })
  h.state.assets.push({ id: ACTOR, name: 'logo', client_id: CLIENT }, { id: OTHER, name: 'foreign', client_id: OTHER })
  h.state.jobs.push({ id: JOB, project_id: P1, format_key: 'mrec', status: 'done', url: null, file_size: 10, error: null })
})

describe('department creative reads are bound to the exact active client', () => {
  it('lists only the requested client\'s projects with revision and protection, without canvas payloads', async () => {
    const result = await run('marketing_list_banner_projects', { clientId: CLIENT }) as Row
    expect(result.ok).toBe(true)
    expect(result.data.items.map((i: Row) => i.projectId).sort()).toEqual([P1, P_IMPORT, P_REVIEW].sort())
    expect(result.data.items.find((i: Row) => i.projectId === P_IMPORT).protected).toEqual(['imported_artwork'])
    expect(result.data.items[0]).not.toHaveProperty('canvasData')
    expect(result.data.items.find((i: Row) => i.projectId === P1).formats).toEqual(['mrec'])
  })

  it('refuses cross-client, inactive-client and revoked reads', async () => {
    expect(await run('marketing_get_banner_project', { clientId: CLIENT, projectId: P_OTHER })).toMatchObject({ ok: false, code: 'not_found' })
    expect(await run('marketing_list_banner_projects', { clientId: INACTIVE })).toMatchObject({ ok: false, code: 'not_found' })
    h.sql = []
    h.deny = true
    expect(await run('marketing_list_banner_assets', { clientId: CLIENT })).toMatchObject({ ok: false, code: 'forbidden' })
    expect(h.sql).toHaveLength(0)
  })

  it('lists only client assets and reports foreign render jobs as unknown', async () => {
    const assets = await run('marketing_list_banner_assets', { clientId: CLIENT }) as Row
    expect(assets.data.items.map((a: Row) => a.name)).toEqual(['logo'])
    const foreign = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    h.state.jobs.push({ id: foreign, project_id: P_OTHER, format_key: 'mrec', status: 'done' })
    const status = await run('marketing_get_banner_render_status', { clientId: CLIENT, projectId: P1, jobIds: [JOB, foreign] }) as Row
    expect(status.data.jobs.map((j: Row) => j.jobId)).toEqual([JOB])
    expect(status.data.unknownJobIds).toEqual([foreign])
  })

  it('previews with the native builder and linter without writing anything', async () => {
    const preview = await run('marketing_preview_banner_project', { clientId: CLIENT, projectId: P1, format: 'mrec' }) as Row
    expect(preview).toMatchObject({ ok: true, data: { width: 300, height: 250, layerCount: 1, sideEffects: 'none' } })
    expect(preview.data.html).toContain('Hello')
    expect(h.sql.some(s => /INSERT|UPDATE|DELETE/.test(s))).toBe(false)
    expect(await run('marketing_preview_banner_project', { clientId: CLIENT, projectId: P1, format: 'mrec', expectedRevision: 'e'.repeat(64) }))
      .toMatchObject({ ok: false, code: 'conflict' })
    expect(await run('marketing_preview_banner_project', { clientId: CLIENT, projectId: P1, format: 'leaderboard' })).toMatchObject({ ok: false, code: 'bad_args' })
  })
})

describe('department creative HTML uses the request-bound asset origin', () => {
  it('resolves relative media against the event binding first, then the process env, in the native order', async () => {
    const image = { mrec: { bgColor: '#000000', layers: [{ id: 1, type: 'image', src: '/media/hero.png', x: 0, y: 0, w: 300, h: 250, startTime: 0, endTime: 4 }] } }
    h.state.projects.find((r: Row) => r.id === P1).canvas_data = image
    const previous = { app: process.env.NUXT_PUBLIC_APP_URL, r2: process.env.R2_PUBLIC_URL }
    process.env.NUXT_PUBLIC_APP_URL = 'https://process.example'
    process.env.R2_PUBLIC_URL = 'https://process-r2.example'
    const envCtx = (env: Row) => ({ ...(ctx as Row), event: { context: { cloudflare: { env } } } }) as never
    const preview = async (env: Row) => ((await runDepartmentCreativeOperation('marketing_preview_banner_project', { clientId: CLIENT, projectId: P1, format: 'mrec' }, envCtx(env))) as Row).data.html as string
    try {
      expect(await preview({ NUXT_PUBLIC_APP_URL: 'https://binding.example' })).toContain('https://binding.example/media/hero.png')
      expect(await preview({})).toContain('https://process.example/media/hero.png')
      delete process.env.NUXT_PUBLIC_APP_URL
      expect(await preview({ R2_PUBLIC_URL: 'https://binding-r2.example' })).toContain('https://binding-r2.example/media/hero.png')
    } finally {
      for (const [name, value] of [['NUXT_PUBLIC_APP_URL', previous.app], ['R2_PUBLIC_URL', previous.r2]] as const) {
        if (value === undefined) Reflect.deleteProperty(process.env, name)
        else process.env[name] = value
      }
    }
  })
})

describe('department creative drafts bind signed identity, revision and protected artwork', () => {
  it('requires a verified execution identity, write consent and non-read-only authority before any database access', async () => {
    const args = { clientId: CLIENT, name: 'New', sourceKind: 'blank', headline: 'Hi', acknowledgement: 'CREATE_BANNER_DRAFT' }
    expect(await run('marketing_create_banner_project', args)).toMatchObject({ ok: false, code: 'coordinator_required' })
    h.readOnly = true
    expect(await run('marketing_create_banner_project', args, key())).toMatchObject({ ok: false, code: 'forbidden' })
    expect(h.sql).toHaveLength(0)
    expect(departmentCreativeTools.find(t => t.name === 'marketing_create_banner_project')!.handler(args, ctx)).resolves.toMatchObject({ code: 'coordinator_required' })
  })

  it('rejects forged provenance tags, missing acknowledgement and mismatched source fields', async () => {
    const base = { clientId: CLIENT, name: 'New', sourceKind: 'blank', headline: 'Hi', acknowledgement: 'CREATE_BANNER_DRAFT' }
    for (const args of [{ ...base, tags: ['source:thebrief'] }, { ...base, acknowledgement: undefined }, { ...base, templateId: TEMPLATE }, { ...base, sourceKind: 'project', headline: undefined }]) {
      expect(await run('marketing_create_banner_project', args, key())).toMatchObject({ ok: false, code: 'bad_args' })
    }
  })

  it('creates a client draft once per execution identity and refuses key reuse with different input', async () => {
    const k = key()
    const args = { clientId: CLIENT, name: 'New', sourceKind: 'template', templateId: TEMPLATE, acknowledgement: 'CREATE_BANNER_DRAFT' }
    const first = await run('marketing_create_banner_project', args, k) as Row
    expect(first).toMatchObject({ ok: true, data: { status: 'draft', clientId: CLIENT, committed: true } })
    expect(h.state.projects.at(-1)).toMatchObject({ client_id: CLIENT, created_by: ACTOR, canvas_data: canvas('Sale') })
    expect(h.state.templates[0].usage_count).toBe(1)
    const replay = await run('marketing_create_banner_project', args, k) as Row
    expect(replay).toMatchObject({ ok: true, data: { replayed: true, projectId: first.data.projectId } })
    expect(h.state.projects).toHaveLength(5)
    expect(await run('marketing_create_banner_project', { ...args, name: 'Changed' }, k)).toMatchObject({ ok: false, code: 'idempotency_conflict' })
    expect(h.state.projects).toHaveLength(5)
  })

  it('copies only the same client\'s exact revision and never inherits import provenance', async () => {
    const copy = { clientId: CLIENT, name: 'Copy', sourceKind: 'project', acknowledgement: 'CREATE_BANNER_DRAFT' }
    expect(await run('marketing_create_banner_project', { ...copy, sourceProjectId: P_OTHER, sourceRevision: 'a'.repeat(64) }, key())).toMatchObject({ ok: false, code: 'not_found' })
    expect(await run('marketing_create_banner_project', { ...copy, sourceProjectId: P_IMPORT, sourceRevision: 'a'.repeat(64) }, key())).toMatchObject({ ok: false, code: 'conflict' })
    expect(h.state.ledger.size).toBe(0)
    const made = await run('marketing_create_banner_project', { ...copy, sourceProjectId: P_IMPORT, sourceRevision: rev(P_IMPORT) }, key()) as Row
    expect(made.ok).toBe(true)
    expect(h.state.projects.at(-1).tags).toEqual(['campaign'])
  })

  it('updates the exact revision, snapshots the previous canvas and rejects stale revisions', async () => {
    const before = rev(P1)
    const k = key()
    const result = await run('marketing_update_banner_project', { clientId: CLIENT, projectId: P1, expectedRevision: before, changes: { canvasData: canvas('Updated'), tags: ['autumn'] }, acknowledgement: 'UPDATE_BANNER_DRAFT' }, k) as Row
    expect(result).toMatchObject({ ok: true, data: { previousRevision: before, snapshotted: true } })
    expect(h.state.versions).toEqual([{ project_id: P1, canvas_data: canvas() }])
    expect(h.state.projects[0]).toMatchObject({ canvas_data: canvas('Updated'), tags: ['autumn'] })
    expect(await run('marketing_update_banner_project', { clientId: CLIENT, projectId: P1, expectedRevision: before, changes: { name: 'Again' }, acknowledgement: 'UPDATE_BANNER_DRAFT' }, key()))
      .toMatchObject({ ok: false, code: 'conflict' })
    expect(h.state.projects[0].name).toBe('Spring')
  })

  it('protects imported artwork canvases and in-review artwork, while preserving provenance tags on allowed changes', async () => {
    const update = (projectId: string, changes: Row) => run('marketing_update_banner_project', { clientId: CLIENT, projectId, expectedRevision: rev(projectId), changes, acknowledgement: 'UPDATE_BANNER_DRAFT' }, key())
    expect(await update(P_IMPORT, { canvasData: canvas('Overwrite') })).toMatchObject({ ok: false, code: 'conflict' })
    expect(await update(P_REVIEW, { name: 'Renamed' })).toMatchObject({ ok: false, code: 'conflict' })
    expect(h.state.versions).toHaveLength(0)
    expect(await update(P_IMPORT, { tags: ['retagged'] })).toMatchObject({ ok: true })
    expect(h.state.projects.find((r: Row) => r.id === P_IMPORT).tags).toEqual(['source:thebrief', `source-sha256:${'a'.repeat(64)}`, 'retagged'])
    expect(await update(P_OTHER, { name: 'x' })).toMatchObject({ ok: false, code: 'not_found' })
  })
})

describe('department creative export uses the native render queue with unknown-outcome safety', () => {
  const exportArgs = () => ({ clientId: CLIENT, projectId: P1, format: 'mrec', expectedRevision: rev(P1), acknowledgement: 'QUEUE_BANNER_RENDER' })

  it('queues the exact revision once and replays without a second dispatch', async () => {
    const double = enqueueDouble()
    const k = key()
    const first = await run('marketing_export_banner_render', exportArgs(), k, double) as Row
    expect(first).toMatchObject({ ok: true, data: { jobIds: [JOB], status: 'queued' } })
    expect(double.calls[0]).toMatchObject({ projectId: P1, userId: ACTOR, fps: 30, quality: 1 })
    expect(double.calls[0].formats[0].html).toContain('Hello')
    expect(double.buildEnqueueDeps.mock.calls[0][0]).toBe((ctx as Row).event)
    expect(await run('marketing_export_banner_render', exportArgs(), k, double)).toMatchObject({ ok: true, data: { replayed: true } })
    expect(double.enqueue).toHaveBeenCalledTimes(1)
  })

  it('refuses stale revisions and revocation before dispatch without queueing', async () => {
    const double = enqueueDouble()
    expect(await run('marketing_export_banner_render', { ...exportArgs(), expectedRevision: 'c'.repeat(64) }, key(), double)).toMatchObject({ ok: false, code: 'conflict' })
    h.authorityCalls = 0
    h.denyAfter = 1
    const k = key()
    expect(await run('marketing_export_banner_render', exportArgs(), k, double)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(double.enqueue).not.toHaveBeenCalled()
    expect([...h.state.ledger.values()].map(r => r.state)).toEqual(['failed'])
  })

  it('holds an unconfirmed queue submission for reconciliation and never retries it', async () => {
    const double = enqueueDouble({ failAfterDispatch: true })
    const k = key()
    expect(await run('marketing_export_banner_render', exportArgs(), k, double)).toMatchObject({ ok: false, code: 'reconciliation_required' })
    expect([...h.state.ledger.values()][0].state).toBe('ambiguous')
    expect(await run('marketing_export_banner_render', exportArgs(), k, double)).toMatchObject({ ok: false, code: 'reconciliation_required' })
    expect(double.enqueue).toHaveBeenCalledTimes(1)
  })
})
