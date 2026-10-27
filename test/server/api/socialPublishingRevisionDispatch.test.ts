// Task 3 delegated social review — real-SQL integration.
//
// Runs the production MCP draft executor, revision submission/review services, the shared dispatcher,
// the pinned media route, the portal decision and the cron expiry sweep against a disposable local
// PostgreSQL database that has the REAL social migrations (incl. 483) applied. Only the provider sink,
// the R2 bucket and the db-module transport are substituted. Requires SOCIAL_TASK3_TEST_DSN pointing at
// an isolated private-socket database (see test/helpers/socialRevisionPostgres.ts); skipped otherwise.
import { createHash, randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'
import {
  SOCIAL_TASK3_DSN,
  clearCachedTables,
  freezeCachedTable,
  guardedSocialTask3Pool,
  resetSocialTask3Schema,
  socialTask3DbModule
} from '../../helpers/socialRevisionPostgres'

const holder = vi.hoisted(() => ({
  db: null as null | Record<string, (...args: any[]) => any>,
  providerPost: null as null | ((params: any) => Promise<any>),
  /** When true the REAL provider registry/adapters run; their HTTP goes to the stubbed global fetch. */
  realProviders: false,
  authUser: null as null | Record<string, unknown>
}))

vi.mock('~~/server/utils/db', () => {
  const call = (name: string) => (...args: any[]) => {
    if (!holder.db) throw new Error('Task 3 database is not configured')
    return holder.db[name]!(...args)
  }
  return {
    queryRows: call('queryRows'),
    queryRowsFresh: call('queryRowsFresh'),
    queryOne: call('queryOne'),
    queryOneFresh: call('queryOneFresh'),
    execute: call('execute'),
    transaction: call('transaction'),
    transactionWithoutRetry: call('transactionWithoutRetry'),
    transactionOnce: call('transactionOnce')
  }
})

vi.mock('~~/server/utils/social-providers/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/social-providers/registry')>()
  return {
    ...actual,
    getProviderOrThrow: (platform: string) => holder.realProviders
      ? actual.getProviderOrThrow(platform)
      : {
          identifier: platform,
          post: (params: any) => holder.providerPost!({ platform, ...params })
        }
  }
})

// Browser routes (delete, approvals list) authenticate the signed-in staff user.
vi.mock('~~/server/utils/auth', () => ({
  requireAuth: async () => holder.authUser,
  requireRole: async () => holder.authUser
}))

const CLIENT_A = '0a000000-0000-4000-8000-00000000000a'
const CLIENT_B = '0b000000-0000-4000-8000-00000000000b'
const STAFF = '51000000-0000-4000-8000-000000000001'
const STAFF_NO_GRANT = '51000000-0000-4000-8000-000000000002'
const STAFF_NO_ASSIGNMENT = '51000000-0000-4000-8000-000000000003'
const ADMIN = 'ad000000-0000-4000-8000-000000000001'
const ADMIN_2 = 'ad000000-0000-4000-8000-000000000002'
const LEAD = '1e000000-0000-4000-8000-000000000001'
const FB_A = 'fa000000-0000-4000-8000-00000000000a'
const IG_A = 'ea000000-0000-4000-8000-00000000000a'
const LI_A = 'ca000000-0000-4000-8000-00000000000a'
const FB_B = 'fb000000-0000-4000-8000-00000000000b'
const IMG_A = 'aa000000-0000-4000-8000-000000000001'
const PNG_A = 'aa000000-0000-4000-8000-000000000002'
const IMG_B = 'bb000000-0000-4000-8000-000000000001'
const IMG_NULL = 'cc000000-0000-4000-8000-000000000001'
const IMG_A2 = 'aa000000-0000-4000-8000-000000000003'
const IG_A2 = 'ea000000-0000-4000-8000-00000000002a'
const CLIENT_USER_A = 'c0000000-0000-4000-8000-00000000000a'
const NEWS_ITEM = 'de000000-0000-4000-8000-000000000001'

interface StoredObject { etag: string, bytes: Uint8Array }
const objects = new Map<string, StoredObject>()
const bucket = {
  async head(key: string) {
    const object = objects.get(key)
    return object ? { size: object.bytes.byteLength, etag: object.etag, httpEtag: `"${object.etag}"` } : null
  },
  async get(key: string, options?: { onlyIf?: { etagMatches?: string } }) {
    const object = objects.get(key)
    if (!object) return null
    const base = { size: object.bytes.byteLength, etag: object.etag, httpEtag: `"${object.etag}"` }
    if (options?.onlyIf?.etagMatches && options.onlyIf.etagMatches !== object.etag) return base
    return { ...base, body: new Response(object.bytes).body }
  }
}
function putObject(key: string, content: string) {
  const bytes = new TextEncoder().encode(content)
  objects.set(key, { bytes, etag: createHash('md5').update(bytes).digest('hex') })
}
const keyFor = (uploader: string, id: string, file: string) => `banner-assets/${uploader}/${id}/${file}`

const grants = (map: Record<string, string[]>) => JSON.stringify(map)
function makeEvent(grantMap: Record<string, string[]> = { [STAFF]: ['social_draft'], [STAFF_NO_ASSIGNMENT]: ['social_draft'], [LEAD]: ['social_draft'] }) {
  return {
    method: 'POST',
    headers: new Headers(),
    node: { req: { headers: {} } },
    context: {
      cloudflare: {
        env: {
          MCP_MARKETING_STAFF_GRANTS: grants(grantMap),
          MEDIA_BUCKET: bucket,
          RENDER_LINK_SECRET: 'task3-render-link-secret-at-least-32-bytes-long',
          APP_URL: 'https://app.xeroflow.example'
        }
      }
    }
  } as any
}

const silentLog = { log: () => {}, warn: () => {}, error: () => {} }
const newKey = () => `mcp:${createHash('sha256').update(randomUUID()).digest('hex')}`
const DIGEST = 'a'.repeat(64)

let pool: Pool
let cachedPool: Pool
let providerCalls: any[] = []
let services: {
  executeSocialMcpTool: typeof import('~~/server/utils/ai/mcp/socialTools')['executeSocialMcpTool']
  resolveMcpStaffContext: typeof import('~~/server/utils/ai/mcp/staffAuthority')['resolveMcpStaffContext']
  revisions: typeof import('~~/server/utils/socialPublishing/revisions')
  authority: typeof import('~~/server/utils/ai/marketing/reviewAuthority')
  dispatch: typeof import('~~/server/utils/socialPublishing/dispatch')
  media: typeof import('~~/server/utils/socialPublishing/mediaAssets')
  portal: typeof import('~~/server/utils/socialNewsPortal')
}

async function seed() {
  await pool.query(`INSERT INTO agency_clients (id, name) VALUES ($1, 'Client A'), ($2, 'Client B')`, [CLIENT_A, CLIENT_B])
  await pool.query(
    `INSERT INTO team_members (id, name, role, user_role) VALUES
       ($1, 'Staff', 'creative', 'creative'), ($2, 'Ungranted', 'creative', 'creative'),
       ($3, 'Unassigned', 'creative', 'creative'), ($4, 'Admin', 'admin', 'admin'),
       ($5, 'Admin Two', 'admin', 'admin'), ($6, 'Lead', 'lead', 'lead')`,
    [STAFF, STAFF_NO_GRANT, STAFF_NO_ASSIGNMENT, ADMIN, ADMIN_2, LEAD]
  )
  await pool.query(`INSERT INTO client_team_assignments (team_member_id, client_id) VALUES ($1, $3), ($2, $3)`, [STAFF, STAFF_NO_GRANT, CLIENT_A])
  await pool.query(
    `INSERT INTO social_accounts (id, client_id, platform, platform_account_id, account_name) VALUES
       ($1, $5, 'facebook', 'fb-page-a', 'A Facebook'), ($2, $5, 'instagram', 'ig-a', 'A Instagram'),
       ($3, $5, 'linkedin', 'urn:li:organization:1', 'A LinkedIn'), ($4, $6, 'facebook', 'fb-page-b', 'B Facebook'),
       ($7, $5, 'instagram', 'ig-a2', 'A Second Instagram')`,
    [FB_A, IG_A, LI_A, FB_B, CLIENT_A, CLIENT_B, IG_A2]
  )
  for (const [id, client, file, mime] of [
    [IMG_A, CLIENT_A, 'a.jpg', 'image/jpeg'],
    [IMG_A2, CLIENT_A, 'a2.jpg', 'image/jpeg'],
    [PNG_A, CLIENT_A, 'a.png', 'image/png'],
    [IMG_B, CLIENT_B, 'b.jpg', 'image/jpeg'],
    [IMG_NULL, null, 'n.jpg', 'image/jpeg']
  ] as const) {
    const key = keyFor(STAFF, id, file)
    putObject(key, `original:${id}`)
    await pool.query(
      `INSERT INTO banner_assets (id, name, mime_type, file_size, r2_key, url, uploaded_by, client_id)
       VALUES ($1, $2, $3, 10, $4, 'https://unused.example/x', $5, $6)`,
      [id, file, mime, key, STAFF, client]
    )
  }
  await pool.query(`INSERT INTO client_users (id, client_id, name) VALUES ($1, $2, 'Client reviewer')`, [CLIENT_USER_A, CLIENT_A])
  await pool.query(`INSERT INTO social_news_items (id, title, source_url) VALUES ($1, 'Story', 'https://news.example/story')`, [NEWS_ITEM])
}

async function staffContext(userId = STAFF, scopes = ['mcp:read', 'mcp:write'], event = makeEvent()) {
  return await services.resolveMcpStaffContext(event, userId, scopes)
}

async function callTool(toolName: string, args: unknown, options: { userId?: string, scopes?: string[], key?: string, event?: any } = {}) {
  const event = options.event ?? makeEvent()
  const userId = options.userId ?? STAFF
  const ctx = await staffContext(userId, options.scopes, event)
  return await services.executeSocialMcpTool({
    toolName, args, ctx, userId, idempotencyKey: options.key ?? newKey(), sessionDigest: DIGEST
  })
}

const futureIso = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString()

async function draftAndSubmit(overrides: Record<string, unknown> = {}) {
  const created = await callTool('create_social_post_draft', {
    clientId: CLIENT_A,
    targets: [{ platform: 'facebook', accountId: FB_A }, { platform: 'instagram', accountId: IG_A }],
    content: 'Reviewed launch copy',
    mediaAssets: [{ kind: 'banner_asset', id: IMG_A }],
    ...overrides
  })
  expect(created.ok, JSON.stringify(created)).toBe(true)
  const postId = (created.data as any).postId as string
  const submitted = await callTool('submit_social_post_for_review', { postId })
  expect(submitted.ok, JSON.stringify(submitted)).toBe(true)
  return { postId, revisionId: (submitted.data as any).revision.id as string, status: submitted.data as any }
}

async function approve(postId: string, revisionId: string, reviewerId = ADMIN, event = makeEvent()) {
  const revision = (await pool.query('SELECT requested_by FROM social_post_revisions WHERE id = $1', [revisionId])).rows[0]
  await services.authority.requireIndependentMarketingReviewer(event, { requesterId: revision.requested_by, clientId: CLIENT_A, reviewerId })
  return await holder.db!.transaction!(async (db: any) => await services.revisions.reviewSocialPostRevision(db, {
    event, postId, revisionId, decision: 'approved', reviewerId
  }))
}

async function dispatch(postId: string, revisionId: string | null, event = makeEvent(), claimStatuses = ['approved']) {
  return await services.dispatch.claimAndPublishSocialPost({
    postId, clientId: CLIENT_A, claimStatuses, source: 'manual', actorId: ADMIN, auditAction: 'post_published',
    event, revisionId, log: silentLog
  })
}

async function postRow(postId: string) {
  return (await pool.query('SELECT * FROM social_posts WHERE id = $1', [postId])).rows[0]
}
async function revisionRow(revisionId: string) {
  return (await pool.query('SELECT * FROM social_post_revisions WHERE id = $1', [revisionId])).rows[0]
}

// ---------------------------------------------------------------------------------------------------
// Real provider adapters over a stubbed network. Every request the FB/IG/LinkedIn adapters make goes
// through the global fetch that ofetch calls, so real ofetch errors (status, URL in the message) are built.
// Our own pinned media URLs are served by the real readPinnedSocialMedia retrieval.

interface NetCall { method: string, url: string, body: string | null, authorization: string | null }
type NetReply = Response | Error | null
let netCalls: NetCall[] = []
let netRoute: (call: NetCall) => NetReply | Promise<NetReply> = () => null

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
const graphError = (status: number, code: number, message = 'Graph error') => json({ error: { message, code } }, status)

function installNetwork(route: (call: NetCall) => NetReply | Promise<NetReply>) {
  netCalls = []
  netRoute = route
  holder.realProviders = true
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null
    const url = request ? request.url : String(input)
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? init.body : null
    const call = { method, url, body, authorization: new Headers(init?.headers ?? request?.headers).get('authorization') }
    netCalls.push(call)
    if (url.includes('/api/public/social-media/')) {
      const token = url.split('/api/public/social-media/')[1]!
      const reply = await netRoute(call)
      if (reply instanceof Error) throw reply
      if (reply) return reply
      const served = await services.media.readPinnedSocialMedia({ event: makeEvent(), token })
      return served.status === 200
        ? new Response(served.body, { status: 200, headers: served.headers })
        : new Response(null, { status: served.status, statusText: served.status === 412 ? 'Precondition Failed' : 'Error' })
    }
    const reply = await netRoute(call)
    if (reply instanceof Error) throw reply
    if (reply) return reply
    throw new Error(`Unrouted test request ${method} ${url}`)
  })
}

function uninstallNetwork() {
  holder.realProviders = false
  vi.unstubAllGlobals()
}

const isPublication = (call: NetCall) =>
  /\/rest\/posts$/.test(call.url) || /\/media_publish$/.test(call.url)
  || (/graph\.facebook\.com\/v25\.0\/fb-page-a\/(feed|videos)$/.test(call.url))

describe.skipIf(!SOCIAL_TASK3_DSN)('delegated social review against real SQL', () => {
  beforeAll(async () => {
    pool = guardedSocialTask3Pool(SOCIAL_TASK3_DSN)
    cachedPool = guardedSocialTask3Pool(SOCIAL_TASK3_DSN, { cached: true })
    await resetSocialTask3Schema(pool)
    holder.db = socialTask3DbModule(pool, cachedPool) as any
    await seed()
    services = {
      executeSocialMcpTool: (await import('~~/server/utils/ai/mcp/socialTools')).executeSocialMcpTool,
      resolveMcpStaffContext: (await import('~~/server/utils/ai/mcp/staffAuthority')).resolveMcpStaffContext,
      revisions: await import('~~/server/utils/socialPublishing/revisions'),
      authority: await import('~~/server/utils/ai/marketing/reviewAuthority'),
      dispatch: await import('~~/server/utils/socialPublishing/dispatch'),
      media: await import('~~/server/utils/socialPublishing/mediaAssets'),
      portal: await import('~~/server/utils/socialNewsPortal')
    }
  })
  afterAll(async () => {
    holder.db = null
    await cachedPool?.end()
    await pool?.end()
  })
  beforeEach(async () => {
    holder.realProviders = false
    holder.authUser = { id: STAFF, role: 'creative', permissionGroups: ['CREATIVE'] }
    await clearCachedTables(pool)
    providerCalls = []
    holder.providerPost = async (params) => {
      providerCalls.push(params)
      return { status: 'success', platformPostId: `${params.platform}-post-${providerCalls.length}`, url: 'https://provider.example/p' }
    }
    for (const [id, file] of [[IMG_A, 'a.jpg'], [PNG_A, 'a.png'], [IMG_A2, 'a2.jpg']] as const) putObject(keyFor(STAFF, id, file), `original:${id}`)
  })

  it('scopes discovery and drafts to assigned clients, grants and signed write consent before any data', async () => {
    const accounts = await callTool('list_social_publishing_accounts', { clientId: CLIENT_A })
    expect(accounts.ok).toBe(true)
    expect((accounts.data as any).accounts.map((a: any) => a.id).sort()).toEqual([FB_A, IG_A, IG_A2, LI_A].sort())
    expect(JSON.stringify(accounts.data)).not.toContain('token')

    expect(await callTool('list_social_publishing_accounts', { clientId: CLIENT_B })).toMatchObject({ ok: false, code: 'not_found' })
    expect(await callTool('list_social_media_assets', { clientId: CLIENT_B })).toMatchObject({ ok: false, code: 'not_found' })
    const media = await callTool('list_social_media_assets', { clientId: CLIENT_A })
    expect((media.data as any).items.map((item: any) => item.id).sort()).toEqual([IMG_A, PNG_A, IMG_A2].sort())

    const base = { clientId: CLIENT_A, targets: [{ platform: 'facebook', accountId: FB_A }], content: 'x' }
    expect(await callTool('create_social_post_draft', { ...base, clientId: CLIENT_B, targets: [{ platform: 'facebook', accountId: FB_B }] }))
      .toMatchObject({ ok: false, code: 'not_found' })
    expect(await callTool('create_social_post_draft', { ...base, targets: [{ platform: 'facebook', accountId: FB_B }] }))
      .toMatchObject({ ok: false, code: 'bad_args' })
    expect(await callTool('create_social_post_draft', { ...base, targets: [{ platform: 'instagram', accountId: FB_A }] }))
      .toMatchObject({ ok: false, code: 'bad_args' })
    expect(await callTool('create_social_post_draft', { ...base, mediaAssets: [{ kind: 'banner_asset', id: IMG_B }] }))
      .toMatchObject({ ok: false, code: 'bad_args' })
    expect(await callTool('create_social_post_draft', { ...base, mediaAssets: [{ kind: 'banner_asset', id: IMG_NULL }] }))
      .toMatchObject({ ok: false, code: 'bad_args' })
    expect(await callTool('create_social_post_draft', base, { userId: STAFF_NO_GRANT }))
      .toMatchObject({ ok: false, code: 'capability_required' })
    expect(await callTool('create_social_post_draft', base, { userId: STAFF_NO_ASSIGNMENT }))
      .toMatchObject({ ok: false, code: 'not_found' })
    expect(await callTool('create_social_post_draft', base, { scopes: ['mcp:read'] }))
      .toMatchObject({ ok: false, code: 'insufficient_scope' })
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM social_posts')).rows[0].n).toBe(0)
  })

  it('creates only delegated drafts (a staff schedule is intent), and replays an identical request idempotently', async () => {
    const key = newKey()
    const args = {
      clientId: CLIENT_A,
      targets: [{ platform: 'facebook', accountId: FB_A }],
      content: 'Draft only',
      scheduledAt: futureIso(2)
    }
    const first = await callTool('create_social_post_draft', args, { key })
    const second = await callTool('create_social_post_draft', args, { key })
    expect(first.ok && second.ok).toBe(true)
    expect((second.data as any).replayed).toBe(true)
    expect((second.data as any).postId).toBe((first.data as any).postId)
    const rows = (await pool.query(`SELECT * FROM social_posts WHERE content = 'Draft only'`)).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'draft', review_policy: 'delegated_marketing', approved_revision_id: null })
    expect((first.data as any).status).toBe('draft')

    // Replays are re-authorized: a revoked grant returns no data.
    const revoked = await callTool('create_social_post_draft', args, { key, event: makeEvent({}) })
    expect(revoked).toMatchObject({ ok: false, code: 'capability_required' })

    // The draft is not claimable by any dispatcher path.
    const claim = await dispatch(rows[0].id, null, makeEvent(), ['draft', 'approved', 'scheduled'])
    expect(claim).toMatchObject({ skipped: true, reason: 'not_claimed' })
    expect(providerCalls).toHaveLength(0)
  })

  it('enforces Instagram media prerequisites before review', async () => {
    const textOnly = await callTool('create_social_post_draft', {
      clientId: CLIENT_A, targets: [{ platform: 'instagram', accountId: IG_A }], content: 'No media'
    })
    const textPost = (textOnly.data as any).postId
    expect(await callTool('submit_social_post_for_review', { postId: textPost }))
      .toMatchObject({ ok: false, code: 'bad_args', error: 'Instagram requires at least one image or video' })
    const png = await callTool('create_social_post_draft', {
      clientId: CLIENT_A, targets: [{ platform: 'instagram', accountId: IG_A }], mediaAssets: [{ kind: 'banner_asset', id: PNG_A }]
    })
    expect(await callTool('submit_social_post_for_review', { postId: (png.data as any).postId }))
      .toMatchObject({ ok: false, code: 'bad_args', error: 'Instagram images must be JPEG' })
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM social_post_revisions')).rows[0].n).toBe(0)
  })

  it('requires an independent fresh owner/admin, exact current revision and unreplaced media; one dispatch per approval', async () => {
    const { postId, revisionId, status } = await draftAndSubmit()
    expect(status.status).toBe('awaiting_review')
    const revision = await revisionRow(revisionId)
    expect(revision.snapshot.media).toEqual([expect.objectContaining({ kind: 'banner_asset', id: IMG_A, mimeType: 'image/jpeg' })])
    expect(revision.content_hash).toMatch(/^[0-9a-f]{64}$/)

    const event = makeEvent()
    await expect(services.authority.requireIndependentMarketingReviewer(event, { requesterId: STAFF, clientId: CLIENT_A, reviewerId: STAFF }))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(services.authority.requireIndependentMarketingReviewer(event, { requesterId: STAFF, clientId: CLIENT_A, reviewerId: LEAD }))
      .rejects.toMatchObject({ statusCode: 403 })
    // The service also refuses a requester decision even if a caller skipped the authority helper.
    await expect(holder.db!.transaction!(async (db: any) => await services.revisions.reviewSocialPostRevision(db, {
      event, postId, revisionId, decision: 'approved', reviewerId: STAFF
    }))).rejects.toMatchObject({ statusCode: 403 })
    await expect(approve(postId, randomUUID())).rejects.toBeTruthy()

    // Replaced bytes behind the same asset UUID and storage key cannot be approved.
    putObject(keyFor(STAFF, IMG_A, 'a.jpg'), 'replaced bytes')
    await expect(approve(postId, revisionId)).rejects.toMatchObject({ statusCode: 409 })
    putObject(keyFor(STAFF, IMG_A, 'a.jpg'), `original:${IMG_A}`)

    const approved = await approve(postId, revisionId)
    expect(approved.post.status).toBe('approved')
    expect(await postRow(postId)).toMatchObject({ approved_revision_id: revisionId, approved_by: ADMIN })
    await expect(approve(postId, revisionId)).rejects.toMatchObject({ statusCode: 409 })

    // A delegated claim needs the expected revision: a revision-less (pre-revision Worker) callback fails closed.
    expect(await dispatch(postId, null)).toMatchObject({ skipped: true, reason: 'not_claimed' })

    const [a, b] = await Promise.all([dispatch(postId, revisionId), dispatch(postId, revisionId)])
    const winners = [a, b].filter(result => !result.skipped)
    expect(winners).toHaveLength(1)
    expect(winners[0]!.status).toBe('published')
    expect(providerCalls.map(call => call.platform).sort()).toEqual(['facebook', 'instagram'])
    expect(await revisionRow(revisionId)).toMatchObject({ review_status: 'dispatch_claimed', dispatch_attempt: 1, dispatch_outcome: 'published' })
    expect(await postRow(postId)).toMatchObject({ status: 'published', publish_attempts: 1 })

    // The provider fetched the content-pinned URL; replaced bytes are refused at retrieval.
    const mediaUrl = providerCalls[0].media[0].url as string
    expect(mediaUrl).toMatch(/^https:\/\/app\.xeroflow\.example\/api\/public\/social-media\/v1\..+\.jpg$/)
    const token = mediaUrl.split('/api/public/social-media/')[1]!
    const served = await services.media.readPinnedSocialMedia({ event: makeEvent(), token })
    expect(served.status).toBe(200)
    putObject(keyFor(STAFF, IMG_A, 'a.jpg'), 'replaced after approval')
    expect((await services.media.readPinnedSocialMedia({ event: makeEvent(), token })).status).toBe(412)

    // Repeated confirmation / retry: zero extra provider effects; published content is locked.
    expect(await dispatch(postId, revisionId)).toMatchObject({ skipped: true })
    expect(providerCalls).toHaveLength(2)
    expect(await callTool('update_social_post_draft', { postId, patch: { content: 'late edit' } }))
      .toMatchObject({ ok: false, code: 'conflict' })
    const audit = (await pool.query(`SELECT action, metadata FROM social_publishing_audit_events WHERE post_id = $1 ORDER BY created_at`, [postId])).rows
    expect(audit.map(row => row.action)).toEqual(expect.arrayContaining(['post_created', 'revision_submitted', 'revision_approved', 'post_published']))
    const published = audit.find(row => row.action === 'post_published')!
    expect(published.metadata).toMatchObject({ revisionId, attempt: 1, requesterId: STAFF, reviewerId: ADMIN })
    expect(JSON.stringify(audit)).not.toContain('task3-render-link-secret')
  })

  it('invalidates approval on edit so an old callback cannot publish the new content', async () => {
    const { postId, revisionId } = await draftAndSubmit({ targets: [{ platform: 'facebook', accountId: FB_A }] })
    await approve(postId, revisionId)
    const edited = await callTool('update_social_post_draft', { postId, patch: { content: 'Changed after approval' } })
    expect(edited.ok).toBe(true)
    expect(await revisionRow(revisionId)).toMatchObject({ review_status: 'superseded' })
    expect(await postRow(postId)).toMatchObject({ status: 'draft', approved_revision_id: null, approved_by: null })
    expect(await dispatch(postId, revisionId, makeEvent(), ['approved', 'draft'])).toMatchObject({ skipped: true })
    const resubmitted = await callTool('submit_social_post_for_review', { postId })
    const next = (resubmitted.data as any).revision
    expect(next.number).toBe(2)
    expect(next.contentHash).not.toBe((await revisionRow(revisionId)).content_hash)
    expect(providerCalls).toHaveLength(0)
  })

  it('holds dispatch with zero provider effects when the requester grant or reviewer authority is revoked', async () => {
    const first = await draftAndSubmit({ targets: [{ platform: 'facebook', accountId: FB_A }] })
    await approve(first.postId, first.revisionId)
    const revokedEvent = makeEvent({})
    expect(await dispatch(first.postId, first.revisionId, revokedEvent)).toMatchObject({ skipped: true, reason: 'review_gate' })
    expect(await postRow(first.postId)).toMatchObject({ status: 'failed', approved_revision_id: null })
    expect(await revisionRow(first.revisionId)).toMatchObject({ review_status: 'expired' })

    const second = await draftAndSubmit({ targets: [{ platform: 'facebook', accountId: FB_A }] })
    await approve(second.postId, second.revisionId, ADMIN_2)
    await pool.query(`UPDATE team_members SET user_role = 'creative' WHERE id = $1`, [ADMIN_2])
    try {
      expect(await dispatch(second.postId, second.revisionId)).toMatchObject({ skipped: true, reason: 'review_gate' })
    } finally {
      await pool.query(`UPDATE team_members SET user_role = 'admin' WHERE id = $1`, [ADMIN_2])
    }
    expect(providerCalls).toHaveLength(0)
  })

  it('fails closed with zero provider calls when an approved account moves to another client', async () => {
    const { postId, revisionId } = await draftAndSubmit({ targets: [{ platform: 'linkedin', accountId: LI_A }], mediaAssets: [] })
    await approve(postId, revisionId)
    await pool.query('UPDATE social_accounts SET client_id = $2 WHERE id = $1', [LI_A, CLIENT_B])
    try {
      const result = await dispatch(postId, revisionId)
      expect(result.status).toBe('failed')
      expect(JSON.stringify(result.platformResults)).toContain('changed or was disconnected')
    } finally {
      await pool.query('UPDATE social_accounts SET client_id = $2 WHERE id = $1', [LI_A, CLIENT_A])
    }
    expect(providerCalls).toHaveLength(0)
    expect(await revisionRow(revisionId)).toMatchObject({ review_status: 'dispatch_claimed', dispatch_outcome: 'failed' })
  })

  it('holds an indeterminate provider outcome as unknown: no retry, no edit, no resubmission', async () => {
    holder.providerPost = async (params) => {
      providerCalls.push(params)
      throw new Error('socket hang up after request')
    }
    const { postId, revisionId } = await draftAndSubmit({ targets: [{ platform: 'facebook', accountId: FB_A }] })
    await approve(postId, revisionId)
    const result = await dispatch(postId, revisionId)
    expect(result.status).toBe('unknown')
    expect(await postRow(postId)).toMatchObject({ status: 'unknown' })
    expect(await revisionRow(revisionId)).toMatchObject({ dispatch_outcome: 'unknown' })
    expect(await dispatch(postId, revisionId, makeEvent(), ['approved', 'scheduled'])).toMatchObject({ skipped: true })
    expect(providerCalls).toHaveLength(1)
    expect(await callTool('update_social_post_draft', { postId, patch: { content: 'retry?' } })).toMatchObject({ ok: false, code: 'conflict' })
    expect(await callTool('submit_social_post_for_review', { postId })).toMatchObject({ ok: false, code: 'conflict' })
    const audit = (await pool.query(`SELECT action FROM social_publishing_audit_events WHERE post_id = $1`, [postId])).rows
    expect(audit.map(row => row.action)).toContain('dispatch_outcome_unknown')
  })

  it('locks a partially published post, and allows a reviewed retry only after an explicit (effect-free) rejection', async () => {
    holder.providerPost = async (params) => {
      providerCalls.push(params)
      return params.platform === 'facebook'
        ? { status: 'success', platformPostId: 'fb-ok', url: 'https://provider.example/fb' }
        : { status: 'failed', platformPostId: '', url: '', error: 'Media format error' }
    }
    const partial = await draftAndSubmit()
    await approve(partial.postId, partial.revisionId)
    expect((await dispatch(partial.postId, partial.revisionId)).status).toBe('partially_published')
    expect(await callTool('submit_social_post_for_review', { postId: partial.postId })).toMatchObject({ ok: false, code: 'conflict' })
    expect(await callTool('update_social_post_draft', { postId: partial.postId, patch: { content: 'x' } })).toMatchObject({ ok: false, code: 'conflict' })

    holder.providerPost = async (params) => {
      providerCalls.push(params)
      return { status: 'failed', platformPostId: '', url: '', error: 'Rejected by provider' }
    }
    const failed = await draftAndSubmit({ targets: [{ platform: 'facebook', accountId: FB_A }] })
    await approve(failed.postId, failed.revisionId)
    expect((await dispatch(failed.postId, failed.revisionId)).status).toBe('failed')
    expect(await dispatch(failed.postId, failed.revisionId)).toMatchObject({ skipped: true })
    const resubmitted = await callTool('submit_social_post_for_review', { postId: failed.postId })
    expect(resubmitted.ok).toBe(true)
    const second = (resubmitted.data as any).revision.id
    expect(await revisionRow(failed.revisionId)).toMatchObject({ dispatch_outcome: 'failed' })
    holder.providerPost = async (params) => {
      providerCalls.push(params)
      return { status: 'success', platformPostId: 'fb-retry', url: 'https://provider.example/fb' }
    }
    await approve(failed.postId, second)
    expect((await dispatch(failed.postId, second)).status).toBe('published')
    expect(providerCalls.filter(call => call.platform === 'facebook')).toHaveLength(3)
  })

  it('expires an unused approval in the cron sweep instead of publishing late', async () => {
    const { postId, revisionId } = await draftAndSubmit({
      targets: [{ platform: 'facebook', accountId: FB_A }], scheduledAt: futureIso(2)
    })
    const approved = await approve(postId, revisionId)
    expect(approved.post.status).toBe('scheduled')
    // Test-only clock skew: the guard trigger keeps expires_at immutable in normal operation.
    await pool.query('ALTER TABLE social_post_revisions DISABLE TRIGGER trg_guard_social_post_revision_write')
    await pool.query(`UPDATE social_post_revisions SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [revisionId])
    await pool.query(`UPDATE social_posts SET scheduled_at = NOW() - INTERVAL '2 minutes' WHERE id = $1`, [postId])
    await pool.query('ALTER TABLE social_post_revisions ENABLE TRIGGER trg_guard_social_post_revision_write')
    process.env.CRON_SECRET = 'task3-cron'
    const { default: cron } = await import('~~/server/api/cron/publish-social-posts.post')
    const result = await (cron as any)({ ...makeEvent(), headers: new Headers({ 'x-cron-secret': 'task3-cron' }), node: { req: { headers: { 'x-cron-secret': 'task3-cron' } } } })
    expect(result.processed).toBe(0)
    expect(await postRow(postId)).toMatchObject({ status: 'draft', approved_revision_id: null })
    expect(await revisionRow(revisionId)).toMatchObject({ review_status: 'expired' })
    expect(providerCalls).toHaveLength(0)
  })

  it.each(['approve', 'request_changes', 'reject'] as const)(
    'refuses a portal %s from a view of revision N after the agency resubmitted N+1, then accepts N+1',
    async (action) => {
      const postId = randomUUID()
      await pool.query(
        `INSERT INTO social_posts (id, client_id, created_by, content, platforms, account_ids, publish_targets, metadata)
         VALUES ($1, $2, $3, 'News copy', ARRAY['facebook'], ARRAY[$4::uuid], $5::jsonb, $6::jsonb)`,
        [postId, CLIENT_A, STAFF, FB_A, JSON.stringify([{ platform: 'facebook', accountId: FB_A }]),
          JSON.stringify({ source: 'mcp_news', newsItemId: NEWS_ITEM })]
      )
      const portalDb = { queryRows: holder.db!.queryRows as any, transaction: holder.db!.transaction as any }
      const submit = async () => await holder.db!.transaction!(async (db: any) => await services.revisions.submitSocialPostForReview(db, {
        event: makeEvent(), postId, requesterId: STAFF, clientIds: [CLIENT_A]
      }))
      const feedback = action === 'approve' ? null : 'Please change the headline.'
      const shown = async () => {
        const list = await services.portal.listPortalSocialNewsDrafts(portalDb, CLIENT_A, { postId })
        return list.drafts[0]!
      }

      // The client loads revision N (the real list projection carries the displayed revision id)...
      const first = await submit()
      const viewN = await shown()
      expect((viewN.approval as any).revisionId).toBe(first.revision.id)
      // ...the agency edits and resubmits N+1 while the decision modal is still open...
      await pool.query(`UPDATE social_posts SET content = 'News copy, corrected' WHERE id = $1`, [postId])
      const second = await submit()
      // ...and the stale decision for N is refused without touching any pointer by hand.
      await expect(services.portal.respondToPortalSocialNewsDraft(portalDb, {
        clientId: CLIENT_A, clientUserId: CLIENT_USER_A, postId, action, feedback, revisionId: (viewN.approval as any).revisionId
      })).rejects.toMatchObject({ statusCode: 409 })
      // A request that omits the displayed revision is refused too (the browser reloads).
      await expect(services.portal.respondToPortalSocialNewsDraft(portalDb, {
        clientId: CLIENT_A, clientUserId: CLIENT_USER_A, postId, action, feedback
      })).rejects.toMatchObject({ statusCode: 409 })
      expect(await postRow(postId)).toMatchObject({ client_approval_status: 'pending', client_approval_revision_id: second.revision.id })

      const viewN1 = await shown()
      expect((viewN1.approval as any).revisionId).toBe(second.revision.id)
      await services.portal.respondToPortalSocialNewsDraft(portalDb, {
        clientId: CLIENT_A, clientUserId: CLIENT_USER_A, postId, action, feedback, revisionId: (viewN1.approval as any).revisionId
      })
      const status = { approve: 'approved', request_changes: 'revision_requested', reject: 'rejected' }[action]
      expect(await postRow(postId)).toMatchObject({ client_approval_status: status, client_approval_revision_id: second.revision.id })
      const audit = (await pool.query(
        `SELECT metadata FROM social_publishing_audit_events WHERE post_id = $1 AND action = $2`, [postId, `client_approval_${status}`]
      )).rows
      expect(audit).toHaveLength(1)
      expect(audit[0].metadata.revisionId).toBe(second.revision.id)

      if (action === 'approve') {
        const internalApprove = async () => await holder.db!.transaction!(async (db: any) => await services.revisions.reviewSocialPostRevision(db, {
          event: makeEvent(), postId, decision: 'approved', reviewerId: LEAD
        }))
        const approved = await internalApprove()
        expect(approved.post.status).toBe('approved')
        expect(await postRow(postId)).toMatchObject({ approved_revision_id: second.revision.id })
      }
    }
  )

  it('keeps the pre-revision portal compatibility path only when no revision pointers exist', async () => {
    const postId = randomUUID()
    await pool.query(
      `INSERT INTO social_posts (id, client_id, created_by, content, platforms, account_ids, metadata,
                                 approval_requested_at, client_approval_status)
       VALUES ($1, $2, $3, 'Old news', ARRAY['facebook'], ARRAY[$4::uuid], $5::jsonb, NOW(), 'pending')`,
      [postId, CLIENT_A, STAFF, FB_A, JSON.stringify({ source: 'mcp_news', newsItemId: NEWS_ITEM })]
    )
    const portalDb = { queryRows: holder.db!.queryRows as any, transaction: holder.db!.transaction as any }
    await expect(services.portal.respondToPortalSocialNewsDraft(portalDb, {
      clientId: CLIENT_A, clientUserId: CLIENT_USER_A, postId, action: 'approve', feedback: null, revisionId: randomUUID()
    })).rejects.toMatchObject({ statusCode: 409 })
    await services.portal.respondToPortalSocialNewsDraft(portalDb, {
      clientId: CLIENT_A, clientUserId: CLIENT_USER_A, postId, action: 'approve', feedback: null
    })
    expect(await postRow(postId)).toMatchObject({ client_approval_status: 'approved', client_approval_revision_id: null })
  })

  it('keeps revision snapshots immutable and independent at the database layer', async () => {
    const { revisionId } = await draftAndSubmit({ targets: [{ platform: 'facebook', accountId: FB_A }] })
    await expect(pool.query(`UPDATE social_post_revisions SET snapshot = '{"tampered":true}'::jsonb WHERE id = $1`, [revisionId]))
      .rejects.toThrow(/immutable/)
    await expect(pool.query(
      `UPDATE social_post_revisions SET review_status = 'approved', reviewed_by = requested_by, reviewed_at = NOW() WHERE id = $1`,
      [revisionId]
    )).rejects.toThrow(/independent_review/)
  })

  // ------------------------------------------------------------------------------------------------
  // Fix round 1 regressions (I1–I10)

  describe('I1: ambiguous publication outcomes through the real adapters', () => {
    afterEach(uninstallNetwork)

    const cases: Array<{
      name: string
      platform: 'facebook' | 'instagram' | 'linkedin'
      media: boolean
      route: (call: NetCall) => NetReply
      expected: 'unknown' | 'failed'
      publicationRequests: number
    }> = [
      { name: 'Facebook /feed 502', platform: 'facebook', media: false, expected: 'unknown', publicationRequests: 1,
        route: call => call.url.endsWith('/fb-page-a/feed') ? new Response('Bad gateway', { status: 502 }) : null },
      { name: 'Facebook /feed transport loss', platform: 'facebook', media: false, expected: 'unknown', publicationRequests: 1,
        route: call => call.url.endsWith('/fb-page-a/feed') ? new TypeError('fetch failed') : null },
      { name: 'Facebook /feed 500 with a transient Graph error', platform: 'facebook', media: false, expected: 'unknown', publicationRequests: 1,
        route: call => call.url.endsWith('/fb-page-a/feed') ? graphError(500, 2, 'Service temporarily unavailable') : null },
      { name: 'Facebook /feed definitive 400 rejection', platform: 'facebook', media: false, expected: 'failed', publicationRequests: 1,
        route: call => call.url.endsWith('/fb-page-a/feed') ? graphError(400, 100, 'Invalid parameter') : null },
      { name: 'Facebook unpublished photo upload 500 (before publication)', platform: 'facebook', media: true, expected: 'failed', publicationRequests: 0,
        route: call => call.url.endsWith('/fb-page-a/photos') ? graphError(500, 2) : null },
      { name: 'Instagram media_publish 504', platform: 'instagram', media: true, expected: 'unknown', publicationRequests: 1,
        route: call => call.url.endsWith('/ig-a/media') ? json({ id: 'container-1' })
          : call.url.endsWith('/ig-a/media_publish') ? new Response('Gateway timeout', { status: 504 }) : null },
      { name: 'Instagram container creation 500 (before publication)', platform: 'instagram', media: true, expected: 'failed', publicationRequests: 0,
        route: call => call.url.endsWith('/ig-a/media') ? graphError(500, 1) : null },
      { name: 'LinkedIn /rest/posts 503', platform: 'linkedin', media: false, expected: 'unknown', publicationRequests: 1,
        route: call => call.url.endsWith('/rest/posts') ? new Response('Unavailable', { status: 503 }) : null },
      { name: 'LinkedIn /rest/posts timeout (no response)', platform: 'linkedin', media: false, expected: 'unknown', publicationRequests: 1,
        route: call => call.url.endsWith('/rest/posts') ? new DOMException('The operation timed out', 'TimeoutError') as unknown as Error : null },
      { name: 'LinkedIn /rest/posts definitive 422', platform: 'linkedin', media: false, expected: 'failed', publicationRequests: 1,
        route: call => call.url.endsWith('/rest/posts') ? json({ message: 'Invalid commentary' }, 422) : null }
    ]

    it.each(cases)('$name → $expected', async ({ platform, media, route, expected, publicationRequests }) => {
      const accountId = { facebook: FB_A, instagram: IG_A, linkedin: LI_A }[platform]
      const { postId, revisionId } = await draftAndSubmit({
        targets: [{ platform, accountId }],
        mediaAssets: media ? [{ kind: 'banner_asset', id: IMG_A }] : []
      })
      await approve(postId, revisionId)
      installNetwork(route)
      const result = await dispatch(postId, revisionId)
      expect(result.status).toBe(expected)
      expect(netCalls.filter(isPublication)).toHaveLength(publicationRequests)
      expect(await postRow(postId)).toMatchObject({ status: expected })
      expect(await revisionRow(revisionId)).toMatchObject({ dispatch_outcome: expected })

      // An uncertain publication is held: no automatic retry, edit or resubmission.
      const before = netCalls.length
      expect(await dispatch(postId, revisionId, makeEvent(), ['approved', 'scheduled', 'failed', 'unknown'])).toMatchObject({ skipped: true })
      expect(netCalls.length).toBe(before)
      const resubmit = await callTool('submit_social_post_for_review', { postId })
      if (expected === 'unknown') expect(resubmit).toMatchObject({ ok: false, code: 'conflict' })
      else expect(resubmit.ok).toBe(true)
    })
  })

  describe('I2: delegated submission and dispatch read accounts uncached', () => {
    it('refuses dispatch when the cached binding still shows the approved account but the fresh row is disconnected or reassigned', async () => {
      for (const change of [
        { sql: 'UPDATE social_accounts SET is_active = FALSE WHERE id = $1', restore: 'UPDATE social_accounts SET is_active = TRUE WHERE id = $1' },
        { sql: `UPDATE social_accounts SET client_id = '${CLIENT_B}' WHERE id = $1`, restore: `UPDATE social_accounts SET client_id = '${CLIENT_A}' WHERE id = $1` }
      ]) {
        const { postId, revisionId } = await draftAndSubmit({ targets: [{ platform: 'facebook', accountId: FB_A }], mediaAssets: [] })
        await approve(postId, revisionId)
        await freezeCachedTable(pool, 'social_accounts') // cached binding: active and owned by client A
        await pool.query(change.sql, [FB_A])
        try {
          // Prove the split is real: the cached reader still returns the stale binding.
          expect(await holder.db!.queryRows!('SELECT id FROM social_accounts WHERE id = $1 AND client_id = $2 AND is_active', [FB_A, CLIENT_A])).toHaveLength(1)
          expect(await holder.db!.queryRowsFresh!('SELECT id FROM social_accounts WHERE id = $1 AND client_id = $2 AND is_active', [FB_A, CLIENT_A])).toHaveLength(0)
          const result = await dispatch(postId, revisionId)
          expect(result.status).toBe('failed')
          expect(JSON.stringify(result.platformResults)).toContain('changed or was disconnected')
        } finally {
          await pool.query(change.restore, [FB_A])
          await clearCachedTables(pool)
        }
      }
      expect(providerCalls).toHaveLength(0)
    })

    it.each(['reconnected', 'disconnected', 'reassigned'] as const)(
      'revalidates the uncached winning binding after a LinkedIn refresh race: %s', async (change) => {
        const { postId, revisionId } = await draftAndSubmit({ targets: [{ platform: 'linkedin', accountId: LI_A }], mediaAssets: [] })
        await approve(postId, revisionId)
        await pool.query(`UPDATE social_accounts SET access_token = 'old-token', refresh_token = 'old-refresh',
          token_expires_at = NOW() + INTERVAL '1 minute' WHERE id = $1`, [LI_A])
        await freezeCachedTable(pool, 'social_accounts')
        vi.stubEnv('LINKEDIN_ORGANIC_CLIENT_SECRET', 'fixture-only-secret')
        installNetwork(async call => {
          if (call.url.endsWith('/oauth/v2/accessToken')) {
            // A real reconnect/disconnect/reassignment wins while the old refresh is in flight.
            await pool.query(`UPDATE social_accounts SET access_token = 'winner-token',
              is_active = $2, client_id = $3, token_expires_at = NOW() + INTERVAL '1 day' WHERE id = $1`,
            [LI_A, change !== 'disconnected', change === 'reassigned' ? CLIENT_B : CLIENT_A])
            return json({ access_token: 'losing-refreshed-token', expires_in: 3600 })
          }
          if (call.url.endsWith('/rest/posts')) return json({}, 201, { 'x-restli-id': 'urn:li:share:refresh-race' })
          return null
        })
        try {
          const result = await dispatch(postId, revisionId)
          expect(netCalls.filter(call => call.url.endsWith('/oauth/v2/accessToken'))).toHaveLength(1)
          expect((await holder.db!.queryOne!('SELECT access_token FROM social_accounts WHERE id = $1', [LI_A])).access_token).toBe('old-token')
          if (change === 'reconnected') {
            expect(result.status).toBe('published')
            expect(netCalls.filter(isPublication)).toHaveLength(1)
            expect(netCalls.find(isPublication)?.authorization).toBe('Bearer winner-token')
          } else {
            expect(result.status).toBe('failed')
            expect(netCalls.filter(isPublication)).toHaveLength(0)
          }
          expect((await pool.query('SELECT access_token FROM social_accounts WHERE id = $1', [LI_A])).rows[0].access_token).toBe('winner-token')
        } finally {
          uninstallNetwork()
          vi.unstubAllEnvs()
          await pool.query(`UPDATE social_accounts SET client_id = $2, is_active = TRUE,
            access_token = 'token', refresh_token = NULL, token_expires_at = NULL WHERE id = $1`, [LI_A, CLIENT_A])
          await clearCachedTables(pool)
        }
      }
    )

    it('refuses submission against a disconnected account even while the cached binding is stale', async () => {
      const created = await callTool('create_social_post_draft', {
        clientId: CLIENT_A, targets: [{ platform: 'facebook', accountId: FB_A }], content: 'Stale binding'
      })
      const postId = (created.data as any).postId
      await freezeCachedTable(pool, 'social_accounts')
      await pool.query('UPDATE social_accounts SET is_active = FALSE WHERE id = $1', [FB_A])
      try {
        expect(await callTool('submit_social_post_for_review', { postId })).toMatchObject({ ok: false, code: 'bad_args' })
        expect((await pool.query('SELECT COUNT(*)::int AS n FROM social_post_revisions WHERE post_id = $1', [postId])).rows[0].n).toBe(0)
      } finally {
        await pool.query('UPDATE social_accounts SET is_active = TRUE WHERE id = $1', [FB_A])
        await clearCachedTables(pool)
      }
    })
  })

  describe('I3: every approved target is preflighted before the first publication', () => {
    it('publishes nothing when a later target needs reconnect', async () => {
      const { postId, revisionId } = await draftAndSubmit({
        targets: [{ platform: 'facebook', accountId: FB_A }, { platform: 'linkedin', accountId: LI_A }], mediaAssets: []
      })
      await approve(postId, revisionId)
      await pool.query(`UPDATE social_accounts SET last_error = 'OAuth token expired' WHERE id = $1`, [LI_A])
      try {
        const result = await dispatch(postId, revisionId)
        expect(result.status).toBe('failed')
        expect(providerCalls).toHaveLength(0)
        expect(result.platformResults![`linkedin:${LI_A}`]).toMatchObject({ status: 'failed', error: 'Preflight: Publishing account requires reconnect' })
        expect(result.platformResults![`facebook:${FB_A}`]!.error).toMatch(/^Not attempted/)
        expect(await revisionRow(revisionId)).toMatchObject({ dispatch_outcome: 'failed' })
      } finally {
        await pool.query('UPDATE social_accounts SET last_error = NULL WHERE id = $1', [LI_A])
      }
    })

    it('keeps legacy browser fan-out: a healthy target still publishes beside a reconnect-required one', async () => {
      const { publishPost } = await import('~~/server/utils/socialPublishing')
      const outcome = await publishPost({
        id: randomUUID(),
        content: 'Legacy copy',
        media_urls: [],
        link_url: null,
        platforms: ['facebook', 'linkedin'],
        publish_targets: [{ platform: 'facebook', accountId: FB_A }, { platform: 'linkedin', accountId: LI_A }],
        platform_overrides: {},
        accounts: [
          { id: FB_A, platform: 'facebook', platform_account_id: 'fb-page-a', access_token: 't', account_name: 'A Facebook' },
          { id: LI_A, platform: 'linkedin', platform_account_id: 'urn:li:organization:1', access_token: 't', account_name: 'A LinkedIn', last_error: 'OAuth token expired' }
        ]
      })
      expect(outcome.status).toBe('partially_published')
      expect(providerCalls.map(call => call.platform)).toEqual(['facebook'])
    })
  })

  describe('I5 + I7: strict reviewed LinkedIn media and capability redaction', () => {
    afterEach(() => {
      uninstallNetwork()
      vi.restoreAllMocks()
    })

    it('creates no LinkedIn post when the second approved image fails, and never exposes the signed media URL', async () => {
      const { postId, revisionId } = await draftAndSubmit({
        targets: [{ platform: 'linkedin', accountId: LI_A }],
        mediaAssets: [{ kind: 'banner_asset', id: IMG_A }, { kind: 'banner_asset', id: PNG_A }]
      })
      await approve(postId, revisionId)
      const consoleCalls: unknown[][] = []
      for (const level of ['log', 'warn', 'error', 'info'] as const) {
        vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { consoleCalls.push(args) })
      }
      let imageInit = 0
      installNetwork((call) => {
        if (call.url.includes('/rest/images?action=initializeUpload')) {
          imageInit += 1
          return json({ value: { uploadUrl: `https://upload.linkedin.example/img-${imageInit}`, image: `urn:li:image:${imageInit}` } })
        }
        if (call.url.startsWith('https://upload.linkedin.example/')) return new Response(null, { status: 201 })
        // The second reviewed object is replaced after dispatch preflight: its pinned retrieval answers 412.
        if (call.url.includes('/api/public/social-media/') && call.url.endsWith('.png')) {
          putObject(keyFor(STAFF, PNG_A, 'a.png'), 'replaced mid-dispatch')
        }
        if (call.url.endsWith('/rest/posts')) return new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:1' } })
        return null
      })

      const result = await dispatch(postId, revisionId)
      const mediaCalls = netCalls.filter(call => call.url.includes('/api/public/social-media/'))
      expect(mediaCalls).toHaveLength(2)
      const tokens = mediaCalls.map(call => call.url.split('/api/public/social-media/')[1]!.replace(/\.[a-z]+$/, ''))
      expect(netCalls.some(call => call.url.endsWith('/rest/posts'))).toBe(false)
      expect(result.status).toBe('failed')
      const targetResult = result.platformResults![`linkedin:${LI_A}`]!
      expect(targetResult.error).toMatch(/Reviewed image 2 of 2 could not be prepared; nothing was posted\. LinkedIn image download failed \(HTTP 412\)/)
      expect(targetResult.error).toContain('/api/public/social-media/[redacted]')

      const status = await callTool('get_social_post_status', { postId })
      const surfaces = {
        result: JSON.stringify(result),
        stored: JSON.stringify(await postRow(postId)),
        revision: JSON.stringify(await revisionRow(revisionId)),
        audit: JSON.stringify((await pool.query('SELECT metadata FROM social_publishing_audit_events WHERE post_id = $1', [postId])).rows),
        status: JSON.stringify(status),
        console: JSON.stringify(consoleCalls.map(args => args.map(arg => arg instanceof Error ? `${arg.message} ${arg.stack}` : arg)))
      }
      for (const token of tokens) {
        const [, payload, signature] = token.split('.')
        for (const [surface, text] of Object.entries(surfaces)) {
          expect(text, `${surface} leaked the capability`).not.toContain(payload!)
          expect(text, `${surface} leaked the signature`).not.toContain(signature!)
        }
      }
      expect(surfaces.console).toContain('LinkedIn image download failed (HTTP 412)')
    })
  })

  describe('I6: submission validates the effective payload dispatch delivers', () => {
    afterEach(uninstallNetwork)

    it('applies inherited Instagram story/reel modes from platform overrides', async () => {
      const story = await callTool('create_social_post_draft', {
        clientId: CLIENT_A,
        targets: [{ platform: 'instagram', accountId: IG_A }],
        platformOverrides: { instagram: { options: { type: 'story' } } },
        mediaAssets: [{ kind: 'banner_asset', id: IMG_A }, { kind: 'banner_asset', id: IMG_A2 }]
      })
      expect(await callTool('submit_social_post_for_review', { postId: (story.data as any).postId }))
        .toMatchObject({ ok: false, code: 'bad_args', error: expect.stringMatching(/exactly one media item/) })
      const reel = await callTool('create_social_post_draft', {
        clientId: CLIENT_A,
        targets: [{ platform: 'instagram', accountId: IG_A }],
        platformOverrides: { instagram: { options: { type: 'reel' } } },
        mediaAssets: [{ kind: 'banner_asset', id: IMG_A }]
      })
      expect(await callTool('submit_social_post_for_review', { postId: (reel.data as any).postId }))
        .toMatchObject({ ok: false, code: 'bad_args', error: 'Instagram reels require a video' })
    })

    it('lets a target option override the inherited platform option and delivers it through the real Instagram adapter', async () => {
      const { postId, revisionId } = await draftAndSubmit({
        targets: [{ platform: 'instagram', accountId: IG_A, options: { type: 'post', collaborators: ['partner.shop'] } }],
        platformOverrides: { instagram: { options: { type: 'story' } } },
        content: 'Two-photo carousel',
        hashtags: ['launch', '#ev'],
        mediaAssets: [{ kind: 'banner_asset', id: IMG_A }, { kind: 'banner_asset', id: IMG_A2 }]
      })
      await approve(postId, revisionId)
      let container = 0
      installNetwork((call) => {
        if (call.url.endsWith('/ig-a/media')) return json({ id: `container-${++container}` })
        if (call.url.endsWith('/ig-a/media_publish')) return json({ id: 'ig-media-1' })
        if (call.url.includes('/ig-media-1?')) return json({ permalink: 'https://instagram.example/p/1' })
        return null
      })
      const result = await dispatch(postId, revisionId)
      expect(result.status).toBe('published')
      const containers = netCalls.filter(call => call.url.endsWith('/ig-a/media')).map(call => JSON.parse(call.body!))
      expect(containers.filter(body => body.is_carousel_item)).toHaveLength(2)
      const carousel = containers.find(body => body.media_type === 'CAROUSEL')!
      expect(carousel.caption).toBe('Two-photo carousel\n\n#launch #ev')
      expect(carousel.collaborators).toBe(JSON.stringify(['partner.shop']))
      expect(containers.some(body => body.media_type === 'STORIES')).toBe(false)
    })

    it('rejects LinkedIn copy or comments that would exceed limits once hashtags and the tracked link are added', async () => {
      const submit = async (fields: Record<string, unknown>) => {
        const created = await callTool('create_social_post_draft', {
          clientId: CLIENT_A, targets: [{ platform: 'linkedin', accountId: LI_A }], ...fields
        })
        expect(created.ok, JSON.stringify(created)).toBe(true)
        return await callTool('submit_social_post_for_review', { postId: (created.data as any).postId })
      }
      expect(await submit({ content: 'x'.repeat(3001) })).toMatchObject({ ok: false, code: 'bad_args', error: expect.stringMatching(/LinkedIn posts allow 3000/) })
      expect(await submit({ content: 'x'.repeat(2990), linkUrl: 'https://dealer.example/offer' }))
        .toMatchObject({ ok: false, code: 'bad_args', error: expect.stringMatching(/LinkedIn posts allow 3000/) })
      expect(await submit({ content: 'x'.repeat(2995), hashtags: ['tags'] }))
        .toMatchObject({ ok: false, code: 'bad_args', error: expect.stringMatching(/LinkedIn posts allow 3000/) })
      expect(await submit({ content: 'ok', firstComment: 'c'.repeat(1251) }))
        .toMatchObject({ ok: false, code: 'bad_args', error: expect.stringMatching(/first comments allow 1250/) })
    })

    it('delivers reviewed hashtags, link and first comment unchanged through the real LinkedIn adapter', async () => {
      const content = 'y'.repeat(2800)
      const { postId, revisionId } = await draftAndSubmit({
        targets: [{ platform: 'linkedin', accountId: LI_A }],
        content,
        hashtags: ['launch'],
        linkUrl: 'https://dealer.example/offer',
        firstComment: 'z'.repeat(1250),
        mediaAssets: []
      })
      await approve(postId, revisionId)
      installNetwork((call) => {
        if (call.url.endsWith('/rest/posts')) return new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:9' } })
        if (call.url.includes('/rest/socialActions/')) return json({ commentUrn: 'urn:li:comment:(urn:li:share:9,1)' }, 201)
        return null
      })
      const result = await dispatch(postId, revisionId)
      expect(result.status).toBe('published')
      const post = JSON.parse(netCalls.find(call => call.url.endsWith('/rest/posts'))!.body!)
      expect(post.commentary).toBe(`${content}\n\n#launch\nhttps://dealer.example/offer?utm_source=linkedin&utm_medium=social&utm_campaign=post_${postId}`)
      const comment = JSON.parse(netCalls.find(call => call.url.includes('/rest/socialActions/'))!.body!)
      expect(comment.message.text).toBe('z'.repeat(1250))
    })
  })

  describe('I9: the review projection shows each destination and its effective settings', () => {
    it('projects client-scoped account identity, mode and copy for two Instagram accounts without credentials', async () => {
      const { postId } = await draftAndSubmit({
        targets: [
          { platform: 'instagram', accountId: IG_A, options: { collaborators: ['partner.shop'] } },
          { platform: 'instagram', accountId: IG_A2, options: { type: 'story' } }
        ],
        content: 'Showroom open day',
        hashtags: ['openday'],
        mediaAssets: [{ kind: 'banner_asset', id: IMG_A }]
      })
      await pool.query(`UPDATE social_accounts SET access_token = 'secret-access-token-value' WHERE id IN ($1, $2)`, [IG_A, IG_A2])
      Object.assign(globalThis, { defineEventHandler: (fn: unknown) => fn, getQuery: (event: any) => event.query ?? {} })
      holder.authUser = { id: ADMIN, role: 'admin', permissionGroups: ['ADMIN'] }
      const { default: approvals } = await import('~~/server/api/agency/social/publishing/approvals/index.get')
      const rows = await (approvals as any)({ ...makeEvent(), method: 'GET', query: { clientId: CLIENT_A } })
      const row = rows.find((item: any) => item.id === postId)
      expect(row.current_snapshot).toBeUndefined()
      expect(row.effective_targets).toEqual([
        expect.objectContaining({
          key: `instagram:${IG_A}`, mode: 'post',
          account: { name: 'A Instagram', platformAccountId: 'ig-a', connected: true },
          content: 'Showroom open day\n\n#openday',
          options: { collaborators: ['partner.shop'] }
        }),
        expect.objectContaining({
          key: `instagram:${IG_A2}`, mode: 'story',
          account: { name: 'A Second Instagram', platformAccountId: 'ig-a2', connected: true },
          content: '',
          notes: [expect.stringMatching(/Stories publish the media only/)]
        })
      ])
      expect(JSON.stringify(rows)).not.toContain('secret-access-token-value')
      await pool.query(`UPDATE social_accounts SET access_token = 'token' WHERE id IN ($1, $2)`, [IG_A, IG_A2])
    })
  })

  describe('I10: delegated publishing evidence survives the browser delete endpoint', () => {
    const deleteEvent = (postId: string) => ({ ...makeEvent(), method: 'DELETE', context: { ...makeEvent().context, params: { id: postId } } })
    async function deletePost(postId: string) {
      Object.assign(globalThis, {
        defineEventHandler: (fn: unknown) => fn,
        getRouterParam: (event: any, key: string) => event.context?.params?.[key],
        createError: (await import('h3')).createError
      })
      const { default: handler } = await import('~~/server/api/agency/social/publishing/posts/[id]/index.delete')
      return await (handler as any)(deleteEvent(postId))
    }

    it('keeps an unknown (held) delegated post, its revision and attempt evidence', async () => {
      holder.providerPost = async (params) => {
        providerCalls.push(params)
        throw new Error('socket hang up after request')
      }
      const { postId, revisionId } = await draftAndSubmit({ targets: [{ platform: 'facebook', accountId: FB_A }], mediaAssets: [] })
      await approve(postId, revisionId)
      expect((await dispatch(postId, revisionId)).status).toBe('unknown')
      await expect(deletePost(postId)).rejects.toMatchObject({ statusCode: 409 })
      expect(await postRow(postId)).toMatchObject({ status: 'unknown' })
      expect(await revisionRow(revisionId)).toMatchObject({ dispatch_outcome: 'unknown', dispatch_attempt: 1 })
      const audit = (await pool.query('SELECT action FROM social_publishing_audit_events WHERE post_id = $1', [postId])).rows
      expect(audit.map(row => row.action)).toContain('dispatch_outcome_unknown')
    })

    it('waits on a concurrent dispatch claim and then keeps the now in-flight post', async () => {
      const { postId, revisionId } = await draftAndSubmit({ targets: [{ platform: 'facebook', accountId: FB_A }], mediaAssets: [] })
      await approve(postId, revisionId)
      const claim = await pool.connect()
      try {
        await claim.query('BEGIN')
        // The dispatcher's atomic claim holds the row lock while the browser delete arrives.
        await claim.query(`UPDATE social_posts SET status = 'publishing', last_attempt_at = NOW() WHERE id = $1 AND status = 'approved'`, [postId])
        const pending = deletePost(postId).then(() => 'deleted', (error: any) => error?.statusCode)
        await new Promise(resolve => setTimeout(resolve, 150))
        const blocked = (await pool.query(
          `SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE 'DELETE FROM social_posts%'`
        )).rows[0].n
        expect(blocked).toBe(1)
        await claim.query('COMMIT')
        expect(await pending).toBe(409)
      } finally {
        claim.release()
      }
      expect(await postRow(postId)).toMatchObject({ status: 'publishing' })
      expect(await revisionRow(revisionId)).toBeTruthy()
    })

    it('still deletes drafts and legacy posts', async () => {
      const draft = await callTool('create_social_post_draft', { clientId: CLIENT_A, targets: [{ platform: 'facebook', accountId: FB_A }], content: 'Throwaway' })
      const draftId = (draft.data as any).postId
      expect(await deletePost(draftId)).toEqual({ ok: true })
      expect(await postRow(draftId)).toBeUndefined()
      const legacyId = randomUUID()
      await pool.query(
        `INSERT INTO social_posts (id, client_id, created_by, content, platforms, status) VALUES ($1, $2, $3, 'Legacy', ARRAY['facebook'], 'published')`,
        [legacyId, CLIENT_A, STAFF]
      )
      expect(await deletePost(legacyId)).toEqual({ ok: true })
      expect(await postRow(legacyId)).toBeUndefined()
    })
  })
})
