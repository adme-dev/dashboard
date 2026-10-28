import { beforeEach, describe, expect, it, vi } from 'vitest'

/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory SQL fake rows */
type Row = Record<string, any>
const h = vi.hoisted(() => ({
  state: {} as Record<string, any>,
  sql: [] as string[],
  groups: [] as string[],
  readOnly: false,
  deny: false,
  reviewerDenied: false,
  reviewerGroups: ['PAGE_STUDIO_APPROVE'] as string[],
  tenant: 'tenant-a' as string | null,
  authCalls: 0,
  denyAfter: Infinity
}))

const TENANT = 'tenant-a'
const CLIENT = '11111111-1111-4111-8111-111111111111'
const OTHER = '33333333-3333-4333-8333-333333333333'
const INACTIVE = '44444444-4444-4444-8444-444444444444'
const ACTOR = '22222222-2222-4222-8222-222222222222'
const AUTHOR = '55555555-5555-4555-8555-555555555555'
const SITE = '66666666-6666-4666-8666-666666666666'
const STUDIO_SITE = '77777777-7777-4777-8777-777777777777'
const FOREIGN_SITE = '88888888-8888-4888-8888-888888888888'
const OTHER_TENANT_SITE = '99999999-9999-4999-8999-999999999999'
const VERSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const RELEASE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const DIGEST = 'd'.repeat(64)

function blankState() {
  const site = (over: Row): Row => ({ tenant_id: TENANT, client_id: CLIENT, name: 'Site', route: '/', status: 'active', current_checkpoint_id: 'cp1', current_version_id: VERSION, entitlement_status: 'active', entitlement_effective: true, pages_per_site_limit: 10, ...over })
  return {
    ledger: new Map<string, Row>(),
    clients: new Map<string, boolean>([[CLIENT, true], [OTHER, true], [INACTIVE, false]]),
    sites: [
      site({ id: SITE }),
      site({ id: STUDIO_SITE, current_version_id: null }),
      site({ id: FOREIGN_SITE, client_id: OTHER }),
      site({ id: OTHER_TENANT_SITE, tenant_id: 'tenant-b' })
    ],
    versions: [{ id: VERSION, tenant_id: TENANT, client_id: CLIENT, site_id: SITE, status: 'in_review', digest: DIGEST, checkpoint_id: 'cp1', author_id: AUTHOR, author_role: 'agency' }],
    pointers: [{ tenant_id: TENANT, client_id: CLIENT, site_id: SITE, environment: 'production', normalized_hostname: 'www.example.com', active_release_id: RELEASE }],
    reviews: [] as Row[],
    audit: [{ resource_id: VERSION, action: 'version.submitted', actor_id: AUTHOR }] as Row[],
    documents: new Map<string, number>([[SITE, 3]]),
    checkpointAuthors: new Map<string, string>()
  }
}
const s = () => h.state

function query(sql: string, p: any[] = []): { rows: Row[], rowCount: number } {
  h.sql.push(sql)
  const out = (rows: Row[]) => ({ rows, rowCount: rows.length })
  if (sql.includes('INSERT INTO god_mode_execution_ledger')) {
    const key = `${p[0]}|${p[1]}`
    if (s().ledger.has(key)) return out([])
    s().ledger.set(key, { state: 'in_progress', route_or_tool: p[3], client_id: p[6], result_reference: p[7] })
    return out([{ state: 'in_progress' }])
  }
  if (sql.includes('FROM god_mode_execution_ledger')) return out([s().ledger.get(`${p[0]}|${p[1]}`)].filter(Boolean))
  if (sql.includes('UPDATE god_mode_execution_ledger')) {
    const row = s().ledger.get(`${p[0]}|${p[1]}`)
    if (!row || row.state !== 'in_progress') return out([])
    Object.assign(row, { state: p[2], execution_metadata: JSON.parse(p[5]) })
    return { rows: [], rowCount: 1 }
  }
  if (sql.includes('FROM page_studio_sites site') && sql.includes('JOIN agency_clients client')) {
    return out(s().sites.filter((r: Row) => r.tenant_id === p[0] && r.client_id === p[1] && s().clients.get(r.client_id) && r.status !== 'archived' && (p[2] === undefined || r.id === p[2])))
  }
  if (sql.includes('FROM page_studio_release_pointers') && sql.includes('FOR UPDATE')) {
    return out(s().pointers.filter((r: Row) => r.tenant_id === p[0] && r.client_id === p[1] && r.site_id === p[2] && r.environment === 'production'))
  }
  if (sql.includes('FROM page_studio_release_pointers')) return out(s().pointers.filter((r: Row) => r.tenant_id === p[0] && r.client_id === p[1] && p[2].includes(r.site_id)))
  if (sql.includes('FROM page_studio_versions version') && sql.includes('LEFT JOIN page_studio_checkpoints checkpoint')) {
    const version = s().versions.find((v: Row) => v.tenant_id === p[0] && v.client_id === p[1] && v.site_id === p[2] && v.id === p[3])
    return out(version ? [{ ...version, checkpoint_author_id: s().checkpointAuthors.get(version.checkpoint_id) ?? null }] : [])
  }
  if (sql.includes('FROM page_studio_reviews') && sql.includes('version_id = $4') && sql.includes('LIMIT 1')) {
    return out(s().reviews.filter((r: Row) => r.version_id === p[3]).reverse().slice(0, 1))
  }
  if (sql.includes('FROM page_studio_versions version') && sql.includes('JOIN page_studio_sites site')) {
    const version = s().versions.find((v: Row) => v.tenant_id === p[0] && v.client_id === p[1] && v.site_id === p[2] && v.id === p[3])
    const site = s().sites.find((r: Row) => r.id === p[2])
    return out(version ? [{ ...version, current_version_id: site.current_version_id, current_checkpoint_id: site.current_checkpoint_id }] : [])
  }
  if (sql.includes('FROM page_studio_versions')) {
    return out(s().versions.filter((v: Row) => v.tenant_id === p[0] && v.client_id === p[1] && v.site_id === p[2] && (p[3] === undefined || v.id === p[3])))
  }
  if (sql.includes('FROM page_studio_reviews') && sql.includes('decision = \'approved\'')) {
    return out(s().reviews.filter((r: Row) => r.version_id === p[3] && r.version_digest === p[4] && r.decision === 'approved').reverse())
  }
  if (sql.includes('INSERT INTO page_studio_reviews')) {
    const row = { id: `review-${s().reviews.length + 1}`, version_id: p[3], version_digest: p[4], reviewer_id: p[5], decision: p[6], decided_at: 'now' }
    s().reviews.push(row)
    return out([row])
  }
  if (sql.includes('FROM page_studio_reviews')) return out(s().reviews)
  if (sql.includes('UPDATE page_studio_versions')) {
    for (const v of s().versions.filter((v: Row) => v.id === p[3])) v.status = p[4]
    return out([])
  }
  if (sql.includes('FROM page_studio_audit_events')) return out(s().audit.filter((a: Row) => a.resource_id === p[3] && a.action === 'version.submitted').reverse())
  if (sql.includes('INSERT INTO page_studio_audit_events')) {
    s().audit.push({ action: p[4], resource_id: p[5], actor_id: p[3] })
    return out([])
  }
  return out([])
}
async function tx<T>(fn: (db: unknown) => Promise<T>): Promise<T> {
  const snapshot = structuredClone({ ...h.state, ledger: [...h.state.ledger], clients: [...h.state.clients], documents: [...h.state.documents] })
  try {
    return await fn({ query: async (sql: string, p?: any[]) => query(sql, p) })
  } catch (error) {
    Object.assign(h.state, { ...snapshot, ledger: new Map(snapshot.ledger), clients: new Map(snapshot.clients), documents: new Map(snapshot.documents) })
    throw error
  }
}

vi.mock('~~/server/utils/db', () => ({
  queryRowsFresh: async (sql: string, p?: any[]) => query(sql, p).rows,
  queryOne: async (sql: string, p?: any[]) => query(sql, p).rows[0] ?? null,
  transaction: tx
}))
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({
  requireMarketingDepartment: vi.fn(async (ctx: Row, write: boolean) => {
    h.authCalls++
    if (h.deny || h.authCalls > h.denyAfter) throw Object.assign(new Error('revoked'), { statusCode: 403 })
    if (write && h.readOnly) throw Object.assign(new Error('read-only'), { statusCode: 403 })
    return { ...ctx, permissionGroups: ['MARKETING_MANAGEMENT', ...h.groups] }
  })
}))
vi.mock('~~/server/utils/ai/marketing/readScope', () => ({
  resolveMarketingReadScope: vi.fn(async () => ({})),
  requireScopedClient: vi.fn(async (_scope: unknown, clientId: string) => {
    if (!h.state.clients.get(clientId)) throw Object.assign(new Error('nf'), { statusCode: 404 })
  })
}))
vi.mock('~~/server/utils/pageStudio/documents', () => {
  class PageStudioDocumentError extends Error {
    constructor(readonly code: string, readonly statusCode: number, message: string) {
      super(message)
      this.name = 'PageStudioDocumentError'
    }
  }
  return {
    PageStudioDocumentError,
    getPageStudioDocument: vi.fn(async (_tenant: string, siteId: string) => siteId === STUDIO_SITE
      ? {
          id: siteId, document: null, revision: 0, pageLimit: 10,
          studio: {
            checkpointId: 'cp1',
            pages: [{ id: 'p1', title: 'Home', route: '/', forms: [{ id: 'f1' }] }, { id: 'p2', title: 'Contact', route: '/contact', forms: [{ id: 'f2' }] }],
            formLibrary: { definitions: [{ id: 'def-1', form: {}, placements: [{ pageId: 'p1', formId: 'f1' }, { pageId: 'p2', formId: 'f2' }] }] }
          }
        }
      : { id: siteId, document: { pages: [] }, revision: h.state.documents.get(siteId) ?? 0, pageLimit: 10 }),
    savePageStudioDocument: vi.fn(async (_db: unknown, input: Row) => {
      const current = h.state.documents.get(input.siteId) ?? 0
      if (current !== input.expectedRevision) throw new PageStudioDocumentError('DOCUMENT_CONFLICT', 409, 'This draft changed in another session. Refresh before saving again.')
      h.state.documents.set(input.siteId, current + 1)
      return { revision: current + 1 }
    })
  }
})

const { runDepartmentWebsiteOperation } = await import('~~/server/utils/ai/marketing/departmentWebsiteOperations')
const documents = await import('~~/server/utils/pageStudio/documents')

let n = 0
const key = () => `mcp:${(++n).toString(16).padStart(64, '0')}`
const ctx = { userId: ACTOR, userRole: 'staff', source: 'mcp', event: { context: { cloudflare: { env: { PAGE_STUDIO_CHECKPOINTS: { get: vi.fn() } } } } } } as never
const deps = { resolveTenant: async () => h.tenant, requireReviewer: vi.fn(async () => {
  if (h.reviewerDenied) throw Object.assign(new Error('no'), { statusCode: 403 })
}), reviewerGroups: vi.fn(async () => h.reviewerGroups) }
const run = (name: string, args: Row, k?: string) => runDepartmentWebsiteOperation(name, args, ctx, k, k ? 'f'.repeat(64) : undefined, deps as never)
const comparison = { digest: DIGEST, checkpointId: 'cp1', releaseId: RELEASE, hostname: 'www.example.com' }
const review = (over: Row = {}) => ({ clientId: CLIENT, siteId: SITE, versionId: VERSION, decision: 'approved', comment: 'Checked copy and forms', expectedComparison: comparison, acknowledgement: 'RECORD_INDEPENDENT_WEBSITE_DECISION', ...over })
const { defaultPageStudioDocument } = await vi.importActual<typeof import('~~/server/utils/pageStudio/documents')>('~~/server/utils/pageStudio/documents')
const document = defaultPageStudioDocument('Site')

beforeEach(() => {
  h.state = blankState()
  h.sql = []
  Object.assign(h, { groups: ['PAGE_STUDIO_VIEW', 'PAGE_STUDIO_EDIT', 'PAGE_STUDIO_APPROVE'], readOnly: false, deny: false, reviewerDenied: false, reviewerGroups: ['PAGE_STUDIO_APPROVE'], tenant: TENANT, authCalls: 0, denyAfter: Infinity })
  vi.clearAllMocks()
})

describe('department website reads require explicit Page Studio grants and the exact mapped client', () => {
  it('lists only the client\'s sites in the organisation tenant with live releases', async () => {
    const result = await run('marketing_list_websites', { clientId: CLIENT }) as Row
    expect(result.data.items.map((i: Row) => i.siteId)).toEqual([SITE, STUDIO_SITE])
    expect(result.data.items[0].releases).toEqual([{ environment: 'production', hostname: 'www.example.com', activeReleaseId: RELEASE }])
  })

  it('denies without the native VIEW grant, outside the tenant, cross-client and for inactive clients', async () => {
    h.groups = []
    expect(await run('marketing_list_websites', { clientId: CLIENT })).toMatchObject({ ok: false, code: 'forbidden' })
    expect(h.sql).toHaveLength(0)
    h.groups = ['PAGE_STUDIO_VIEW']
    expect(await run('marketing_get_website', { clientId: CLIENT, siteId: FOREIGN_SITE })).toMatchObject({ ok: false, code: 'not_found' })
    expect(await run('marketing_get_website', { clientId: CLIENT, siteId: OTHER_TENANT_SITE })).toMatchObject({ ok: false, code: 'not_found' })
    expect(await run('marketing_list_websites', { clientId: INACTIVE })).toMatchObject({ ok: false, code: 'not_found' })
    h.tenant = null
    expect(await run('marketing_list_websites', { clientId: CLIENT })).toMatchObject({ ok: false, code: 'unavailable' })
  })

  it('returns the exact review comparison for a submitted current version', async () => {
    const result = await run('marketing_get_website', { clientId: CLIENT, siteId: SITE }) as Row
    expect(result.data.reviewComparison).toEqual({ versionId: VERSION, ...comparison })
    expect(result.data.loginBoundOperations).toContain('marketing_publish_website_version')
    expect(result.data.unsupportedOverMcp).toEqual(expect.arrayContaining(['domains', 'subscriptions']))
  })

  it('reads drafts only with EDIT and exposes reusable form identities for Studio sites', async () => {
    h.groups = ['PAGE_STUDIO_VIEW']
    expect(await run('marketing_get_website_draft', { clientId: CLIENT, siteId: STUDIO_SITE })).toMatchObject({ ok: false, code: 'forbidden' })
    h.groups = ['PAGE_STUDIO_EDIT']
    const draft = await run('marketing_get_website_draft', { clientId: CLIENT, siteId: STUDIO_SITE }) as Row
    expect(draft.data).toMatchObject({ editorKind: 'studio', editable: false })
    expect(draft.data.forms).toEqual([{ key: 'def-1', definitionId: 'def-1', placements: [{ pageId: 'p1', formId: 'f1', route: '/' }, { pageId: 'p2', formId: 'f2', route: '/contact' }] }])
    expect(vi.mocked(documents.getPageStudioDocument).mock.calls[0][2]).toBe((ctx as Row).event.context.cloudflare.env.PAGE_STUDIO_CHECKPOINTS)
  })
})

describe('department website draft saves bind revision, entitlement and identity', () => {
  it('saves a Dashboard-document draft once and replays without a second save', async () => {
    h.state.sites[0].current_checkpoint_id = null
    const k = key()
    const args = { clientId: CLIENT, siteId: SITE, expectedRevision: 3, document, acknowledgement: 'SAVE_WEBSITE_DRAFT' }
    expect(await run('marketing_save_website_draft', args, k)).toMatchObject({ ok: true, data: { revision: 4, published: false } })
    expect(await run('marketing_save_website_draft', args, k)).toMatchObject({ ok: true, data: { replayed: true, revision: 4 } })
    expect(documents.savePageStudioDocument).toHaveBeenCalledTimes(1)
    expect(await run('marketing_save_website_draft', { ...args, expectedRevision: 4 }, k)).toMatchObject({ ok: false, code: 'idempotency_conflict' })
  })

  it('refuses stale revisions, Studio sites, expired entitlement, missing EDIT and read-only roles', async () => {
    h.state.sites[0].current_checkpoint_id = null
    const args = { clientId: CLIENT, siteId: SITE, expectedRevision: 2, document, acknowledgement: 'SAVE_WEBSITE_DRAFT' }
    expect(await run('marketing_save_website_draft', args, key())).toMatchObject({ ok: false, code: 'conflict' })
    expect(s().ledger.size).toBe(0)
    expect(await run('marketing_save_website_draft', { ...args, siteId: STUDIO_SITE, expectedRevision: 0 }, key())).toMatchObject({ ok: false, code: 'conflict' })
    h.state.sites[0].entitlement_effective = false
    expect(await run('marketing_save_website_draft', { ...args, expectedRevision: 3 }, key())).toMatchObject({ ok: false, code: 'forbidden' })
    h.groups = ['PAGE_STUDIO_VIEW']
    expect(await run('marketing_save_website_draft', { ...args, expectedRevision: 3 }, key())).toMatchObject({ ok: false, code: 'forbidden' })
    h.groups = ['PAGE_STUDIO_EDIT']
    h.readOnly = true
    expect(await run('marketing_save_website_draft', { ...args, expectedRevision: 3 }, key())).toMatchObject({ ok: false, code: 'forbidden' })
    expect(documents.savePageStudioDocument).toHaveBeenCalledTimes(1)
    expect(s().documents.get(SITE)).toBe(3)
  })
})

describe('department website reviews are independent and bound to the exact compared release', () => {
  it('records an independent approval through the native review service once', async () => {
    const k = key()
    expect(await run('marketing_review_website_version', review(), k)).toMatchObject({ ok: true, data: { decision: 'approved', versionDigest: DIGEST, published: false } })
    expect(s().versions[0].status).toBe('approved')
    expect(s().reviews).toHaveLength(1)
    expect(deps.requireReviewer).toHaveBeenCalledWith((ctx as Row).event, { requesterId: AUTHOR, clientId: CLIENT, reviewerId: ACTOR })
    expect(await run('marketing_review_website_version', review(), k)).toMatchObject({ ok: true, data: { replayed: true } })
    expect(s().reviews).toHaveLength(1)
  })

  it('refuses authors, submitters, non-independent reviewers and missing APPROVE without recording anything', async () => {
    s().versions[0].author_id = ACTOR
    expect(await run('marketing_review_website_version', review(), key())).toMatchObject({ ok: false, code: 'forbidden' })
    s().versions[0].author_id = AUTHOR
    s().audit.push({ resource_id: VERSION, action: 'version.submitted', actor_id: ACTOR })
    expect(await run('marketing_review_website_version', review(), key())).toMatchObject({ ok: false, code: 'forbidden' })
    s().audit.pop()
    h.reviewerDenied = true
    expect(await run('marketing_review_website_version', review(), key())).toMatchObject({ ok: false, code: 'forbidden' })
    h.reviewerDenied = false
    h.groups = ['PAGE_STUDIO_VIEW', 'PAGE_STUDIO_EDIT']
    expect(await run('marketing_review_website_version', review(), key())).toMatchObject({ ok: false, code: 'forbidden' })
    expect(s().reviews).toHaveLength(0)
    expect(s().ledger.size).toBe(0)
  })

  it('refuses an earlier submitter and the author of the reviewed checkpoint content', async () => {
    s().audit.unshift({ resource_id: VERSION, action: 'version.submitted', actor_id: ACTOR })
    expect(await run('marketing_review_website_version', review(), key())).toMatchObject({ ok: false, code: 'forbidden' })
    s().audit.shift()
    s().checkpointAuthors.set('cp1', ACTOR.toUpperCase())
    expect(await run('marketing_review_website_version', review(), key())).toMatchObject({ ok: false, code: 'forbidden' })
    expect(s().reviews).toHaveLength(0)
    expect(s().ledger.size).toBe(0)
  })

  it('refuses a changed digest, checkpoint or live release, and requires the comparison', async () => {
    for (const changed of [{ digest: 'e'.repeat(64) }, { checkpointId: 'cp2' }, { releaseId: null, hostname: null }]) {
      expect(await run('marketing_review_website_version', review({ expectedComparison: { ...comparison, ...changed } }), key())).toMatchObject({ ok: false, code: 'conflict' })
    }
    expect(await run('marketing_review_website_version', review({ expectedComparison: undefined }), key())).toMatchObject({ ok: false, code: 'bad_args' })
    expect(await run('marketing_review_website_version', review({ siteId: FOREIGN_SITE }), key())).toMatchObject({ ok: false, code: 'not_found' })
    expect(s().reviews).toHaveLength(0)
    expect(s().versions[0].status).toBe('in_review')
  })

  it('requires a verified execution identity and fails closed on revocation', async () => {
    expect(await run('marketing_review_website_version', review())).toMatchObject({ ok: false, code: 'coordinator_required' })
    h.deny = true
    expect(await run('marketing_review_website_version', review(), key())).toMatchObject({ ok: false, code: 'forbidden' })
    expect(h.sql).toHaveLength(0)
  })
})

describe('department website submission, candidate build and publication use the original agency login', () => {
  const REVIEWER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const proof = (over: Row = {}) => ({ role: 'agency', userId: ACTOR, tokenHash: 'a'.repeat(64), issuedAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() + 3_600_000), ...over })
  const build = { buildId: 'build_1', versionDigest: DIGEST, astro: { context: { identity: { environment: 'production', source: { kind: 'approved-version', versionId: VERSION, checkpoint: { id: 'cp1' } } } } } }
  let natives: Row
  let login: Row | null
  const runL = (name: string, args: Row, k?: string) => runDepartmentWebsiteOperation(name, args, ctx, k, k ? 'f'.repeat(64) : undefined, { ...deps, loginProof: () => login, native: natives } as never)
  const publish = (over: Row = {}) => ({ clientId: CLIENT, siteId: SITE, versionId: VERSION, expectedVersionDigest: DIGEST, buildId: 'build_1', environment: 'production', hostname: 'www.example.com', expectedActiveReleaseId: RELEASE, acknowledgement: 'PUBLISH_APPROVED_WEBSITE', ...over })
  const candidate = { clientId: CLIENT, siteId: SITE, versionId: VERSION, expectedVersionDigest: DIGEST, environment: 'production', acknowledgement: 'BUILD_APPROVED_WEBSITE_CANDIDATE' }
  const ledgerStates = () => [...s().ledger.values()].map(r => r.state)

  beforeEach(() => {
    h.groups = ['PAGE_STUDIO_VIEW', 'PAGE_STUDIO_EDIT', 'PAGE_STUDIO_PUBLISH']
    login = proof()
    s().versions[0].status = 'approved'
    s().reviews.push({ id: 'r0', version_id: VERSION, version_digest: DIGEST, reviewer_id: REVIEWER, decision: 'approved' })
    const verifyBuild = vi.fn(async (pointer: unknown) => pointer)
    natives = {
      mutateHistory: vi.fn(async () => ({ checkpointId: 'cp1', versionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', currentCheckpointId: 'cp1', isCurrent: true })),
      buildServices: vi.fn(() => ({ environment: 'production', services: { verifyBuild } })),
      coordinateBuild: vi.fn(async () => ({ buildId: 'build_1' })),
      registerPreview: vi.fn(async () => ({ hostname: 'build-1.preview.example.net', release: { releaseId: 'preview-1' } })),
      buildPointer: vi.fn(async () => build),
      isFeatureBuild: vi.fn(async () => false),
      deliveryWorker: vi.fn(() => ({ verifyBuild })),
      activate: vi.fn(async (_input: Row, opts: Row) => opts.runTransaction(async () => ({ releaseId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }))),
      publishAuthority: vi.fn(async (_scope: Row, _principal: Row, work: (db: unknown) => Promise<unknown>) => work({}))
    }
    ;(ctx as Row).event.context.cloudflare.env.PAGE_STUDIO_RELEASE_PREVIEW_HOSTNAME = 'preview.example.net'
  })

  it('requires a current original agency login for this actor before any record or Worker effect', async () => {
    for (const bad of [null, proof({ userId: AUTHOR }), proof({ role: 'client' }), proof({ expiresAt: new Date(Date.now() - 1000) })]) {
      login = bad
      expect(await runL('marketing_publish_website_version', publish(), key())).toMatchObject({ ok: false, code: 'reconnect_required' })
      expect(await runL('marketing_submit_website_version', { clientId: CLIENT, siteId: SITE, expectedCheckpointId: 'cp1', name: 'v2', acknowledgement: 'SUBMIT_WEBSITE_FOR_REVIEW' }, key())).toMatchObject({ ok: false, code: 'reconnect_required' })
    }
    expect(s().ledger.size).toBe(0)
    expect(natives.activate).not.toHaveBeenCalled()
    expect(natives.mutateHistory).not.toHaveBeenCalled()
    h.groups = ['PAGE_STUDIO_VIEW', 'PAGE_STUDIO_EDIT']
    login = proof()
    expect(await runL('marketing_publish_website_version', publish(), key())).toMatchObject({ ok: false, code: 'forbidden' })
  })

  it('submits the exact saved Studio draft through native history with the proven login, once', async () => {
    const k = key()
    const args = { clientId: CLIENT, siteId: SITE, expectedCheckpointId: 'cp1', name: 'Spring refresh', acknowledgement: 'SUBMIT_WEBSITE_FOR_REVIEW' }
    expect(await runL('marketing_submit_website_version', args, k)).toMatchObject({ ok: true, data: { status: 'in_review', published: false } })
    const call = natives.mutateHistory.mock.calls[0][0]
    expect(call).toMatchObject({ actor: { role: 'agency', actorId: ACTOR, tenantId: TENANT }, login, event: (ctx as Row).event, body: { action: 'name', submitForReview: true, expectedCheckpointId: 'cp1' } })
    expect(call.body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(await runL('marketing_submit_website_version', args, k)).toMatchObject({ ok: true, data: { replayed: true } })
    expect(natives.mutateHistory).toHaveBeenCalledTimes(1)
    expect(await runL('marketing_submit_website_version', { ...args, expectedCheckpointId: 'cp-old' }, key())).toMatchObject({ ok: false, code: 'conflict' })
  })

  it('publishes an independently approved exact build through native publish authority, once', async () => {
    const k = key()
    expect(await runL('marketing_publish_website_version', publish(), k)).toMatchObject({ ok: true, data: { status: 'published', releaseId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' } })
    expect(natives.publishAuthority.mock.calls[0].slice(0, 2)).toEqual([{ tenantId: TENANT, clientId: CLIENT, siteId: SITE }, { actorId: ACTOR, tenantId: TENANT, login }])
    expect(natives.activate.mock.calls[0][0]).toMatchObject({ buildId: 'build_1', hostname: 'www.example.com', expectedActiveReleaseId: RELEASE, environment: 'production' })
    expect(ledgerStates()).toEqual(['succeeded'])
    expect(await runL('marketing_publish_website_version', publish(), k)).toMatchObject({ ok: true, data: { replayed: true } })
    expect(natives.activate).toHaveBeenCalledTimes(1)
  })

  it('refuses unapproved, self-approved, changed and mismatched builds before activation', async () => {
    s().reviews[0].reviewer_id = AUTHOR
    expect(await runL('marketing_publish_website_version', publish(), key())).toMatchObject({ ok: false, code: 'forbidden' })
    s().reviews[0].reviewer_id = REVIEWER
    expect(await runL('marketing_publish_website_version', publish({ expectedVersionDigest: 'e'.repeat(64) }), key())).toMatchObject({ ok: false, code: 'conflict' })
    s().versions[0].status = 'in_review'
    expect(await runL('marketing_publish_website_version', publish(), key())).toMatchObject({ ok: false, code: 'conflict' })
    expect(s().ledger.size).toBe(0)
    s().versions[0].status = 'approved'
    expect(await runL('marketing_publish_website_version', publish({ environment: 'staging' }), key())).toMatchObject({ ok: false, code: 'conflict' })
    natives.buildPointer.mockResolvedValueOnce({ ...build, versionDigest: 'f'.repeat(64) })
    expect(await runL('marketing_publish_website_version', publish(), key())).toMatchObject({ ok: false, code: 'conflict' })
    natives.isFeatureBuild.mockResolvedValueOnce(true)
    expect(await runL('marketing_publish_website_version', publish(), key())).toMatchObject({ ok: false, code: 'conflict' })
    expect(ledgerStates()).toEqual(['failed', 'failed', 'failed'])
    expect(natives.activate).not.toHaveBeenCalled()
  })

  it('requires the approval to come from a currently eligible reviewer independent of every author and submitter', async () => {
    const reviewerOnlyDenied = (input: Row) => {
      if (h.reviewerDenied && input.reviewerId === REVIEWER) throw Object.assign(new Error('no'), { statusCode: 403 })
    }
    deps.requireReviewer.mockImplementation(async (_event: unknown, input: Row) => reviewerOnlyDenied(input))
    // An earlier (not latest) submission by the reviewer.
    s().audit.unshift({ resource_id: VERSION, action: 'version.submitted', actor_id: REVIEWER })
    expect(await runL('marketing_publish_website_version', publish(), key())).toMatchObject({ ok: false, code: 'forbidden' })
    expect(await runL('marketing_build_website_candidate', candidate, key())).toMatchObject({ ok: false, code: 'forbidden' })
    s().audit.shift()
    // The reviewer authored the approved checkpoint content.
    s().checkpointAuthors.set('cp1', REVIEWER)
    expect(await runL('marketing_publish_website_version', publish(), key())).toMatchObject({ ok: false, code: 'forbidden' })
    s().checkpointAuthors.clear()
    // The reviewer is no longer an independent marketing reviewer for this client.
    h.reviewerDenied = true
    expect(await runL('marketing_publish_website_version', publish(), key())).toMatchObject({ ok: false, code: 'forbidden' })
    expect(deps.requireReviewer).toHaveBeenCalledWith((ctx as Row).event, { requesterId: AUTHOR, clientId: CLIENT, reviewerId: REVIEWER })
    h.reviewerDenied = false
    // The reviewer lost the native Page Studio APPROVE grant.
    h.reviewerGroups = ['MARKETING_MANAGEMENT']
    expect(await runL('marketing_build_website_candidate', candidate, key())).toMatchObject({ ok: false, code: 'forbidden' })
    expect(deps.reviewerGroups).toHaveBeenCalledWith(expect.anything(), REVIEWER)
    h.reviewerGroups = ['PAGE_STUDIO_APPROVE']
    // A later decision supersedes the approval for this version.
    s().reviews.push({ id: 'r1', version_id: VERSION, version_digest: DIGEST, reviewer_id: REVIEWER, decision: 'returned_to_draft' })
    expect(await runL('marketing_publish_website_version', publish(), key())).toMatchObject({ ok: false, code: 'forbidden' })
    s().reviews.pop()
    expect(s().ledger.size).toBe(0)
    expect(natives.activate).not.toHaveBeenCalled()
    expect(natives.coordinateBuild).not.toHaveBeenCalled()
    expect(await runL('marketing_publish_website_version', publish(), key())).toMatchObject({ ok: true })
  })

  it('reads the original login only from the exact consumed MCP request event and tool', async () => {
    const { signMcpRequestClaim, digestMcpRequestBody, MCP_REQUEST_AUDIENCE } = await import('~~/shared/utils/mcpRequestClaim')
    const { consumeMcpRequestClaim } = await import('~~/server/utils/ai/mcp/requestClaim')
    const tool = 'marketing_publish_website_version'
    const secret = 'department-website-transport-secret'
    const original = { role: 'agency' as const, userId: ACTOR, tokenHash: 'c'.repeat(64), issuedAt: Date.now() - 60_000, expiresAt: Date.now() + 600_000 }
    const consume = async (event: Row, pageStudioLogin?: typeof original) => {
      const body = { userId: ACTOR, tool, args: publish(), idempotencyKey: key() }
      const encoded = await signMcpRequestClaim({
        uid: ACTOR, scope: ['mcp:read', 'mcp:write'], godMode: false, audience: MCP_REQUEST_AUDIENCE, method: 'POST', path: '/api/internal/mcp/call',
        toolName: tool, bodyDigest: await digestMcpRequestBody(body), ...(pageStudioLogin ? { pageStudioLogin } : {})
      }, secret)
      await consumeMcpRequestClaim(event as never, encoded, ACTOR, {
        signingSecret: secret, body, method: 'POST', path: '/api/internal/mcp/call', scopeHeader: undefined,
        resolveAuthority: (async () => null) as never, consumeNonce: async () => true
      })
    }
    const realDeps = { ...deps, native: natives } as never
    const on = (event: Row) => ({ ...(ctx as Row), event }) as never
    const consumed = { context: (ctx as Row).event.context }
    await consume(consumed, original)
    // Another event object (even sharing the same context), another tool, or a legacy grant: no proof.
    expect(await runDepartmentWebsiteOperation(tool, publish(), on({ context: consumed.context }), key(), 'f'.repeat(64), realDeps)).toMatchObject({ ok: false, code: 'reconnect_required' })
    expect(await runDepartmentWebsiteOperation('marketing_build_website_candidate', candidate, on(consumed), key(), 'f'.repeat(64), realDeps)).toMatchObject({ ok: false, code: 'reconnect_required' })
    const legacy = { context: consumed.context }
    await consume(legacy)
    expect(await runDepartmentWebsiteOperation(tool, publish(), on(legacy), key(), 'f'.repeat(64), realDeps)).toMatchObject({ ok: false, code: 'reconnect_required' })
    expect(natives.publishAuthority).not.toHaveBeenCalled()
    expect(await runDepartmentWebsiteOperation(tool, publish(), on(consumed), key(), 'f'.repeat(64), realDeps)).toMatchObject({ ok: true, data: { status: 'published' } })
    expect(natives.publishAuthority.mock.calls[0][1]).toEqual({ actorId: ACTOR, tenantId: TENANT, login: { ...original, issuedAt: new Date(original.issuedAt), expiresAt: new Date(original.expiresAt) } })
    expect(JSON.stringify(natives.publishAuthority.mock.calls[0][1])).not.toMatch(/eyJ|Bearer/)
  })

  it('re-checks the reviewer immediately before the Worker effect', async () => {
    deps.reviewerGroups.mockResolvedValueOnce(['PAGE_STUDIO_APPROVE']).mockResolvedValueOnce([])
    expect(await runL('marketing_publish_website_version', publish(), key())).toMatchObject({ ok: false, code: 'forbidden' })
    expect(ledgerStates()).toEqual(['failed'])
    expect(natives.deliveryWorker).not.toHaveBeenCalled()
    expect(natives.activate).not.toHaveBeenCalled()
  })

  it('fails closed on revocation after the claim and holds an interrupted activation for reconciliation', async () => {
    h.authCalls = 0
    h.denyAfter = 1
    expect(await runL('marketing_publish_website_version', publish(), key())).toMatchObject({ ok: false, code: 'forbidden' })
    expect(natives.deliveryWorker).not.toHaveBeenCalled()
    h.denyAfter = Infinity
    natives.activate.mockRejectedValueOnce(new Error('connection reset'))
    const k = key()
    expect(await runL('marketing_publish_website_version', publish(), k)).toMatchObject({ ok: false, code: 'reconciliation_required' })
    expect(await runL('marketing_publish_website_version', publish(), k)).toMatchObject({ ok: false, code: 'reconciliation_required' })
    expect(ledgerStates()).toEqual(['failed', 'ambiguous'])
    expect(natives.activate).toHaveBeenCalledTimes(1)
  })

  it('builds an approved candidate and returns only the private preview hostname', async () => {
    const result = await runL('marketing_build_website_candidate', candidate, key()) as Row
    expect(result).toMatchObject({ ok: true, data: { buildId: 'build_1', previewHostname: 'build-1.preview.example.net', published: false } })
    expect(JSON.stringify(result)).not.toMatch(/token|session":\{/i)
    expect(natives.coordinateBuild.mock.calls[0][1]).toEqual({ actorId: ACTOR, tenantId: TENANT, login })
    natives.buildServices.mockReturnValueOnce({ environment: 'staging', services: {} })
    expect(await runL('marketing_build_website_candidate', candidate, key())).toMatchObject({ ok: false, code: 'conflict' })
    expect(natives.coordinateBuild).toHaveBeenCalledTimes(1)
  })
})
