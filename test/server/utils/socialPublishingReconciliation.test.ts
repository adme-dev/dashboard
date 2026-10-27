import { createError } from 'h3'
import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { guardedSocialTask3Pool, resetSocialTask3Schema, socialTask3DbModule } from '../../helpers/socialRevisionPostgres'

const fixture = vi.hoisted(() => ({ db: null as any, request: vi.fn(), browserActor: '' }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: async () => ({ id: fixture.browserActor, role: 'creative', permissionGroups: ['CREATIVE'] }) }))
vi.mock('~~/server/utils/db', () => Object.fromEntries(['execute', 'queryOne', 'queryRows', 'queryOneFresh', 'queryRowsFresh', 'transaction', 'transactionOnce', 'transactionWithoutRetry'].map(key => [key, (...args: any[]) => fixture.db[key](...args)])))
vi.mock('~~/server/utils/social-providers/http', async original => ({ ...await original<any>(), providerFetch: (...args: any[]) => fixture.request(...args) }))
// Exercise dormant implementation in isolation; production remains unconditionally externally gated.
vi.mock('~~/server/utils/socialPublishing/platformReadiness', async original => ({ ...await original<any>(), productionReadyPublishPlatformsError: () => null, assertProductionReadyPublishPlatforms: () => {} }))
// Override only static provider support: grants, health, actor authority and review stay real.
vi.mock('~~/shared/socialCapabilityReadiness', async (original) => {
  const actual = await original<typeof import('~~/shared/socialCapabilityReadiness')>()
  return {
    ...actual,
    providerOperationSupport: (platform: string, operation: string) => platform === 'tiktok' && operation === 'organic_publish'
      ? { state: 'available', reason: 'Explicit dormant test override' }
      : actual.providerOperationSupport(platform, operation as Parameters<typeof actual.providerOperationSupport>[1])
  }
})
const dsn = process.env.SOCIAL_TASK5_TEST_DSN ?? ''
const C = '0a000000-0000-4000-8000-00000000000a', STAFF = '51000000-0000-4000-8000-000000000001', ADMIN = 'ad000000-0000-4000-8000-000000000001', A = 'fa000000-0000-4000-8000-00000000000a', IMG = 'aa000000-0000-4000-8000-000000000001'
const creator = { creator_nickname: 'Fixture creator', creator_username: 'fixture', privacy_level_options: ['SELF_ONLY'], comment_disabled: false, duet_disabled: false, stitch_disabled: true, max_video_post_duration_sec: 300 }
let pool: ReturnType<typeof guardedSocialTask3Pool>
const event = () => ({ context: { cloudflare: { env: { MCP_MARKETING_STAFF_GRANTS: JSON.stringify({ [STAFF]: ['social_draft'] }), APP_URL: 'https://fixture.example', RENDER_LINK_SECRET: 'task-five-private-fixture-secret-at-least-32-bytes', MEDIA_BUCKET: { head: async () => ({ size: 10, etag: 'exact-bytes' }), get: async () => ({ size: 10, etag: 'exact-bytes', body: new Response('0123456789').body }) } } } } } as any)
async function approved(extraTargets: any[] = []) {
  const { createSocialPostDraft } = await import('~~/server/utils/socialPublishing/drafts')
  const { submitSocialPostForReview, reviewSocialPostRevision } = await import('~~/server/utils/socialPublishing/revisions')
  const actor = { actorId: STAFF, clientIds: [C], event: event() }
  const draft = await fixture.db.transaction((db: any) => createSocialPostDraft(actor, { clientId: C, content: 'Exact reviewed copy', targets: [{ platform: 'tiktok', accountId: A, options: { privacy_level: 'SELF_ONLY', consent: true } }, ...extraTargets], mediaAssets: [{ kind: 'banner_asset', id: IMG }] }, db))
  const submitted = await fixture.db.transaction((db: any) => submitSocialPostForReview(db, { event: event(), postId: draft.postId, requesterId: STAFF, clientIds: [C] }))
  await fixture.db.transaction((db: any) => reviewSocialPostRevision(db, { event: event(), postId: draft.postId, revisionId: submitted.revision.id, reviewerId: ADMIN, decision: 'approved' }))
  return { postId: draft.postId, revisionId: submitted.revision.id }
}
async function dispatch(ids: { postId: string, revisionId: string }) {
  return (await import('~~/server/utils/socialPublishing/dispatch')).claimAndPublishSocialPost({ ...ids, event: event(), clientId: C, claimStatuses: ['approved'], source: 'manual' })
}
async function due() {
  await pool.query('UPDATE social_post_target_attempts SET next_poll_at=NOW()-INTERVAL \'1 second\' WHERE state=\'accepted\'')
}
const reconcile = async () => (await import('~~/server/utils/socialPublishing/reconciliation')).reconcileDueSocialPostTargets({ event: event() })
describe('dormant fixture eligibility boundary', () => {
  it('keeps actual production TikTok support disabled', async () => {
    const support = await vi.importActual<typeof import('~~/shared/socialCapabilityReadiness')>('~~/shared/socialCapabilityReadiness')
    const readiness = await vi.importActual<typeof import('~~/server/utils/socialPublishing/platformReadiness')>('~~/server/utils/socialPublishing/platformReadiness')
    expect(support.providerOperationSupport('tiktok', 'organic_publish').state).toBe('external_blocked')
    expect(support.platformPublishingSupport('tiktok').productionReady).toBe(false)
    expect(() => readiness.assertProductionReadyPublishPlatforms(['tiktok'])).toThrow('not production-ready')
  })

  it('retains real grant and account checks under the static support override', async () => {
    const { providerAccountOperationEligibility } = await import('~~/server/utils/socialPublishing/capabilityReadiness')
    const healthy = { platform: 'tiktok', isActive: true, hasRefreshToken: true, metadata: { grantedScopes: ['video.publish'], refreshTokenExpiresAt: '2099-01-01T00:00:00Z' } }
    expect(providerAccountOperationEligibility(healthy, 'organic_publish').state).toBe('available')
    expect(providerAccountOperationEligibility({ ...healthy, metadata: { ...healthy.metadata, grantedScopes: [] } }, 'organic_publish').state).toBe('external_blocked')
    expect(providerAccountOperationEligibility({ ...healthy, isActive: false }, 'organic_publish').state).toBe('external_blocked')
    expect(providerAccountOperationEligibility(healthy, 'organic_comment').state).toBe('unsupported')
  })
})

describe.skipIf(!dsn)('Task5 actual reviewed dispatch, provider adapter and SQL', () => {
  beforeAll(async () => {
    pool = guardedSocialTask3Pool(dsn)
    fixture.db = socialTask3DbModule(pool)
  })
  afterAll(async () => {
    await pool?.end()
  })
  beforeEach(async () => {
    await resetSocialTask3Schema(pool)
    await pool.query('INSERT INTO agency_clients(id,name) VALUES($1,\'Client\')', [C])
    await pool.query('INSERT INTO team_members(id,name,role,user_role) VALUES($1,\'Staff\',\'creative\',\'creative\'),($2,\'Admin\',\'admin\',\'admin\')', [STAFF, ADMIN])
    await pool.query('INSERT INTO client_team_assignments VALUES($1,$2)', [STAFF, C])
    await pool.query(`INSERT INTO social_accounts(id,client_id,platform,platform_account_id,refresh_token,token_expires_at,metadata) VALUES($1,$2,'tiktok','creator','refresh',NOW()+INTERVAL '1 day',$3::jsonb)`, [A, C, JSON.stringify({ grantedScopes: ['video.publish'], refreshTokenExpiresAt: '2099-01-01T00:00:00Z' })])
    await pool.query(`INSERT INTO banner_assets(id,name,mime_type,file_size,r2_key,url,uploaded_by,client_id) VALUES($1,'Photo','image/jpeg',10,$2,'unused',$3,$4)`, [IMG, `banner-assets/${STAFF}/${IMG}/photo.jpg`, STAFF, C])
    fixture.request.mockReset().mockImplementation(async (url: string) => url.includes('creator_info') ? { data: creator, error: { code: 'ok' } } : url.includes('/init/') ? { data: { publish_id: 'v_pub_file~v2-1.123456789' }, error: { code: 'ok', log_id: 'receipt' } } : { data: { status: 'PUBLISH_COMPLETE' }, error: { code: 'ok' } })
  })
  it('accepts exactly once, concurrently reconciles once, and leaves initial revision outcome immutable', async () => {
    const ids = await approved()
    const outcomes = await Promise.all([dispatch(ids), dispatch(ids)])
    expect(outcomes.some(r => r.status === 'accepted')).toBe(true)
    expect(fixture.request.mock.calls.filter(([url]) => url.includes('/init/'))).toHaveLength(1)
    await due()
    await Promise.all([reconcile(), reconcile()])
    expect(fixture.request.mock.calls.filter(([url]) => url.includes('/status/fetch/'))).toHaveLength(1)
    const post = (await pool.query('SELECT * FROM social_posts WHERE id=$1', [ids.postId])).rows[0]
    expect(post.status).toBe('published')
    expect((await pool.query('SELECT provider_receipt FROM social_post_target_attempts')).rows[0].provider_receipt.init).toEqual({ code: 'ok', logId: 'receipt' })
    expect(post.platform_results[`tiktok:${A}`]).toMatchObject({ providerStatus: 'PUBLISH_COMPLETE', publicPostIds: [], url: '' })
    expect((await pool.query('SELECT dispatch_outcome FROM social_post_revisions WHERE id=$1', [ids.revisionId])).rows[0].dispatch_outcome).toBe('accepted')
    await expect(pool.query('UPDATE social_post_target_attempts SET state=\'accepted\'')).rejects.toThrow('immutable')
    await expect(pool.query('UPDATE social_post_target_receipts SET result=\'{}\'::jsonb')).rejects.toThrow('immutable')
    await expect(pool.query('DELETE FROM social_post_target_receipts')).rejects.toThrow('immutable')
    await expect(pool.query(`INSERT INTO social_post_target_receipts(attempt_id,result)
      SELECT id,jsonb_build_object('platform','tiktok','accountId',account_id,'platformAccountId','wrong-creator','status','accepted')
      FROM social_post_target_attempts`)).rejects.toThrow('receipt does not match')
    await expect(pool.query('DELETE FROM social_posts WHERE id=$1', [ids.postId])).rejects.toThrow()
  })
  it.each(['PROCESSING_DOWNLOAD', 'FAILED', 'FUTURE'])('preserves status meaning %s', async (status) => {
    const ids = await approved()
    await dispatch(ids)
    await due()
    fixture.request.mockResolvedValue({ data: { status, fail_reason: 'photo_pull_failed' }, error: { code: 'ok' } })
    await reconcile()
    const row = (await pool.query('SELECT * FROM social_post_target_attempts')).rows[0]
    expect(row.state).toBe(status === 'FAILED' ? 'failed' : status === 'FUTURE' ? 'unknown' : 'accepted')
    expect(row.poll_count).toBe(1)
    expect(Boolean(row.next_poll_at)).toBe(status === 'PROCESSING_DOWNLOAD')
  })
  it('holds unknown init without a receipt and never fetches status or repeats init', async () => {
    const ids = await approved()
    fixture.request.mockImplementation(async (url: string) => {
      if (url.includes('creator_info'))
        return { data: creator, error: { code: 'ok' } }
      throw { statusCode: 503 }
    })
    expect((await dispatch(ids)).status).toBe('unknown')
    await due()
    await reconcile()
    await dispatch(ids)
    expect((await pool.query('SELECT state,publish_id FROM social_post_target_attempts')).rows[0]).toMatchObject({ state: 'unknown', publish_id: null })
    expect(fixture.request.mock.calls.filter(([url]) => url.includes('/init/'))).toHaveLength(1)
    expect(fixture.request.mock.calls.filter(([url]) => url.includes('/status/fetch/'))).toHaveLength(0)
  })
  it.each(['success', 'failed', 'unknown', 'interrupted'])('R1 commits publication before first-comment transport: %s', async (mode) => {
    const B = 'fb000000-0000-4000-8000-00000000000b'
    await pool.query('INSERT INTO social_accounts(id,client_id,platform,platform_account_id,metadata) VALUES($1,$2,\'facebook\',\'page\',$3::jsonb)', [B, C, JSON.stringify({ grantedScopes: ['pages_manage_posts', 'pages_manage_engagement'] })])
    const actor = { actorId: STAFF, clientIds: [C], event: event() }
    const { createSocialPostDraft } = await import('~~/server/utils/socialPublishing/drafts')
    const { submitSocialPostForReview, reviewSocialPostRevision } = await import('~~/server/utils/socialPublishing/revisions')
    const draft = await fixture.db.transaction((db: any) => createSocialPostDraft(actor, { clientId: C, content: 'Known post', firstComment: 'Optional comment', targets: [{ platform: 'facebook', accountId: B }], mediaAssets: [] }, db))
    const submitted = await fixture.db.transaction((db: any) => submitSocialPostForReview(db, { event: event(), postId: draft.postId, requesterId: STAFF, clientIds: [C] }))
    await fixture.db.transaction((db: any) => reviewSocialPostRevision(db, { event: event(), postId: draft.postId, revisionId: submitted.revision.id, reviewerId: ADMIN, decision: 'approved' }))
    const ids = { postId: draft.postId, revisionId: submitted.revision.id }
    let entered!: () => void, release!: () => void
    const waiting = new Promise<void>((r) => {
        entered = r
      }), gate = new Promise<void>((r) => {
        release = r
      })
    fixture.request.mockImplementation(async (url: string) => {
      if (url.endsWith('/comments')) {
        entered()
        await gate
        if (mode === 'failed')
          throw { statusCode: 400, data: { error: { message: 'Rejected comment' } } }
        if (mode === 'unknown' || mode === 'interrupted')
          throw { statusCode: 503 }
        return { id: 'exact_comment' }
      }
      return { id: 'page_exact_post' }
    })
    // Simulate dispatcher termination after the outstanding comment transport, before completion persistence.
    const service = await import('~~/server/utils/socialPublishing/reconciliation')
    const persistComment = (service as any).recordSocialFirstCommentOutcome
    const stop = mode === 'interrupted' && persistComment ? vi.spyOn(service as any, 'recordSocialFirstCommentOutcome').mockRejectedValue(new Error('fixture interrupted before comment receipt')) : null
    const running = dispatch(ids).then(value => ({ value }), error => ({ error }))
    await waiting
    try {
      const receipt = (await pool.query('SELECT result FROM social_post_target_receipts')).rows[0]
      expect(receipt?.result).toMatchObject({ status: 'success', platformPostId: 'page_exact_post' })
      const post = (await pool.query('SELECT * FROM social_posts')).rows[0]
      expect(post.platform_results[`facebook:${B}`]).toMatchObject({ status: 'success', platformPostId: 'page_exact_post', firstComment: { status: 'unknown' } })
      expect(post.status).toBe('partially_published')
    } finally {
      release()
      await running
      stop?.mockRestore()
    }
    const result = await running
    if (mode === 'interrupted') expect((result as any).error?.message).toContain('fixture interrupted')
    const post = (await pool.query('SELECT * FROM social_posts')).rows[0]
    expect(post.status).toBe(mode === 'success' ? 'published' : 'partially_published')
    expect(post.platform_results[`facebook:${B}`]).toMatchObject({ status: 'success', platformPostId: 'page_exact_post', firstComment: { status: mode === 'interrupted' ? 'unknown' : mode } })
    const initial = (await pool.query('SELECT result FROM social_post_target_receipts')).rows[0].result
    expect(initial.firstComment.status).toBe('unknown')
    if (mode === 'success') {
      await expect(pool.query('UPDATE social_post_first_comment_receipts SET result=\'{}\'::jsonb')).rejects.toThrow('immutable')
      await expect(pool.query('DELETE FROM social_post_first_comment_receipts')).rejects.toThrow('immutable')
      await expect(pool.query('INSERT INTO social_post_first_comment_receipts(attempt_id,result) SELECT id,\'{"status":"success"}\'::jsonb FROM social_post_target_attempts')).rejects.toThrow('does not match')
      await expect(pool.query('UPDATE social_post_target_receipts SET result=\'{}\'::jsonb')).rejects.toThrow('immutable')
    }
    await dispatch(ids)
    await reconcile()
    expect(fixture.request.mock.calls.filter(([url]) => url.endsWith('/feed'))).toHaveLength(1)
    expect(fixture.request.mock.calls.filter(([url]) => url.endsWith('/comments'))).toHaveLength(1)
  })
  it.each(['requester', 'reviewer', 'account', 'client'])('denies revoked %s before status access', async (mode) => {
    const ids = await approved()
    await dispatch(ids)
    await due()
    fixture.request.mockClear()
    if (mode === 'requester' || mode === 'reviewer') await pool.query('UPDATE team_members SET is_active=FALSE WHERE id=$1', [mode === 'requester' ? STAFF : ADMIN])
    if (mode === 'account') await pool.query('UPDATE social_accounts SET is_active=FALSE WHERE id=$1', [A])
    if (mode === 'client') await pool.query('DELETE FROM client_team_assignments')
    await reconcile()
    expect(fixture.request).not.toHaveBeenCalled()
    expect((await pool.query('SELECT state FROM social_post_target_attempts')).rows[0].state).toBe('accepted')
  })
  it('bounds repeated lookup failure and never converts it into content failure', async () => {
    const ids = await approved()
    await dispatch(ids)
    await pool.query('UPDATE social_post_target_attempts SET poll_count=19,next_poll_at=NOW()-INTERVAL \'1 second\'')
    fixture.request.mockRejectedValue(new Error('network'))
    await reconcile()
    expect((await pool.query('SELECT state,poll_count,provider_status FROM social_post_target_attempts')).rows[0])
      .toMatchObject({ state: 'unknown', poll_count: 20, provider_status: 'reconciliation_limit_reached' })
  })
  it('rejects cross-client or changed target evidence at the SQL boundary', async () => {
    const ids = await approved()
    await dispatch(ids)
    await expect(pool.query('UPDATE social_post_target_attempts SET account_id=$1', [randomUUID()])).rejects.toThrow('immutable')
    await expect(pool.query('UPDATE social_post_target_attempts SET publish_id=\'another-id\'')).rejects.toThrow('immutable')
  })
  it.each(['reconnect', 'disconnect', 'reassign'])('keeps fresh TikTok credential authority when %s wins refresh', async (mode) => {
    const ids = await approved()
    await dispatch(ids)
    await due()
    await pool.query('UPDATE social_accounts SET token_expires_at=NOW()+INTERVAL \'1 minute\'')
    const oauth = await import('~~/server/utils/socialOAuth/tiktok')
    const refresh = vi.spyOn(oauth, 'refreshTikTokContentToken').mockImplementation(async () => {
      if (mode === 'reconnect') await pool.query('UPDATE social_accounts SET access_token=\'winner\',refresh_token=\'winner-refresh\',token_expires_at=NOW()+INTERVAL \'1 day\',metadata=metadata || \'{"grantWinner":true}\'::jsonb')
      if (mode === 'disconnect') await pool.query('UPDATE social_accounts SET is_active=FALSE')
      if (mode === 'reassign') await pool.query('UPDATE social_accounts SET client_id=$1', [randomUUID()])
      return { access_token: 'loser', expires_in: 3600, refresh_token: 'loser-refresh', refresh_expires_in: 120, scope: 'video.publish' }
    })
    const ev = event()
    ev.context.cloudflare.env.TIKTOK_CONTENT_CLIENT_KEY = 'fixture-key'
    ev.context.cloudflare.env.TIKTOK_CONTENT_CLIENT_SECRET = 'fixture-secret'
    fixture.request.mockClear()
    try {
      await (await import('~~/server/utils/socialPublishing/reconciliation')).reconcileDueSocialPostTargets({ event: ev })
      if (mode === 'reconnect') {
        expect(fixture.request).toHaveBeenCalledWith(expect.stringContaining('/status/fetch/'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer winner' }) }))
        const a = (await pool.query('SELECT * FROM social_accounts')).rows[0]
        expect(a.refresh_token).toBe('winner-refresh')
        expect(a.metadata.grantWinner).toBe(true)
        expect(a.metadata.refreshTokenExpiresAt).toBe('2099-01-01T00:00:00Z')
      } else expect(fixture.request).not.toHaveBeenCalled()
    } finally { refresh.mockRestore() }
  })
  it.each(['success', 'failed'])('I1 persists receipt before later target returns and never regresses terminal target: %s', async (second) => {
    const B = 'fb000000-0000-4000-8000-00000000000b'
    await pool.query('INSERT INTO social_accounts(id,client_id,platform,platform_account_id,metadata) VALUES($1,$2,\'facebook\',\'page\',$3::jsonb)', [B, C, JSON.stringify({ grantedScopes: ['pages_manage_posts'] })])
    const ids = await approved([{ platform: 'facebook', accountId: B }])
    let entered!: () => void, release!: () => void
    const waiting = new Promise<void>((resolve) => {
      entered = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    fixture.request.mockImplementation(async (url: string) => {
      if (url.includes('creator_info')) return { data: creator, error: { code: 'ok' } }
      if (url.includes('/init/')) return { data: { publish_id: 'v_pub_file~v2-1.123456789' }, error: { code: 'ok', log_id: 'receipt' } }
      if (url.includes('graph.facebook.com')) {
        entered()
        await gate
        if (second === 'failed')
          throw { statusCode: 400, data: { error: { message: 'Rejected' } } }
        return { id: 'page_post' }
      }
      return { data: { status: 'PUBLISH_COMPLETE' }, error: { code: 'ok' } }
    })
    const running = dispatch(ids)
    await waiting
    try {
      const attempts = (await pool.query('SELECT * FROM social_post_target_attempts ORDER BY platform')).rows
      expect(attempts.find(a => a.platform === 'tiktok')).toMatchObject({ state: 'accepted', publish_id: 'v_pub_file~v2-1.123456789' })
      expect(attempts).toHaveLength(2)
      await due()
      await reconcile()
      const mid = (await pool.query('SELECT * FROM social_posts WHERE id=$1', [ids.postId])).rows[0]
      expect(Object.keys(mid.platform_results)).toHaveLength(2)
      expect(mid.platform_results[`tiktok:${A}`].status).toBe('success')
      expect(mid.status).not.toBe('published')
    } finally {
      release()
      await running
    }
    const post = (await pool.query('SELECT * FROM social_posts WHERE id=$1', [ids.postId])).rows[0]
    expect(post.status).toBe(second === 'success' ? 'published' : 'partially_published')
    expect(post.platform_results[`tiktok:${A}`].providerStatus).toBe('PUBLISH_COMPLETE')
    expect(post.platform_results[`facebook:${B}`].status).toBe(second)
    expect((await pool.query('SELECT dispatch_outcome FROM social_post_revisions')).rows[0].dispatch_outcome).toBe('accepted')
    expect(fixture.request.mock.calls.filter(([url]) => url.includes('/init/'))).toHaveLength(1)
  })
  it('I1 retains a late receipt after an abandoned queued claim without rewriting terminal unknown evidence', async () => {
    const ids = await approved()
    let entered!: () => void, release!: () => void
    const waiting = new Promise<void>((r) => {
        entered = r
      }), gate = new Promise<void>((r) => {
        release = r
      })
    fixture.request.mockImplementation(async (url: string) => {
      if (url.includes('creator_info')) return { data: creator, error: { code: 'ok' } }
      entered()
      await gate
      return { data: { publish_id: 'v_pub_file~v2-1.123456789' }, error: { code: 'ok', log_id: 'late' } }
    })
    const running = dispatch(ids)
    await waiting
    const beforeReceipt = (await pool.query('SELECT status FROM social_posts')).rows[0].status
    // Only the disposable fixture ages a reservation; production identity remains immutable.
    await pool.query('ALTER TABLE social_post_target_attempts DISABLE TRIGGER social_target_attempt_guard')
    await pool.query('UPDATE social_post_target_attempts SET created_at=NOW()-INTERVAL \'11 minutes\'')
    await pool.query('ALTER TABLE social_post_target_attempts ENABLE TRIGGER social_target_attempt_guard')
    await reconcile()
    const held = (await pool.query('SELECT * FROM social_post_target_attempts')).rows[0]
    release()
    await running
    expect(beforeReceipt).toBe('publishing')
    expect((await pool.query('SELECT * FROM social_post_target_attempts')).rows[0]).toEqual(held)
    expect((await pool.query('SELECT status FROM social_posts')).rows[0].status).toBe('unknown')
    const receipt = (await pool.query('SELECT result FROM social_post_target_receipts')).rows[0].result
    expect(receipt).toMatchObject({ status: 'accepted', platformPostId: 'v_pub_file~v2-1.123456789', providerReceipt: { logId: 'late' } })
    await dispatch(ids)
    await reconcile()
    expect(fixture.request.mock.calls.filter(([url]) => url.includes('/init/'))).toHaveLength(1)
  })
  it('I1 interruption after the first durable receipt retains the whole target set without continuing fan-out', async () => {
    const B = 'fb000000-0000-4000-8000-00000000000b'
    await pool.query('INSERT INTO social_accounts(id,client_id,platform,platform_account_id,metadata) VALUES($1,$2,\'facebook\',\'page\',$3::jsonb)', [B, C, JSON.stringify({ grantedScopes: ['pages_manage_posts'] })])
    const ids = await approved([{ platform: 'facebook', accountId: B }])
    const service = await import('~~/server/utils/socialPublishing/reconciliation')
    const persist = service.recordSocialTargetOutcome
    const interrupted = vi.spyOn(service, 'recordSocialTargetOutcome').mockImplementation(async (...args) => {
      await persist(...args)
      throw new Error('fixture lost acknowledgement after receipt commit')
    })
    try {
      await expect(dispatch(ids)).rejects.toThrow('lost acknowledgement')
    } finally {
      interrupted.mockRestore()
    }
    const receipts = (await pool.query('SELECT result FROM social_post_target_receipts')).rows
    expect(receipts).toHaveLength(1)
    expect(receipts[0].result).toMatchObject({ platformPostId: 'v_pub_file~v2-1.123456789', providerReceipt: { logId: 'receipt' } })
    expect((await pool.query('SELECT dispatch_outcome FROM social_post_revisions')).rows[0].dispatch_outcome).toBeNull()
    await due()
    await reconcile()
    await pool.query('ALTER TABLE social_post_target_attempts DISABLE TRIGGER social_target_attempt_guard')
    await pool.query('UPDATE social_post_target_attempts SET created_at=NOW()-INTERVAL \'11 minutes\' WHERE state=\'queued\'')
    await pool.query('ALTER TABLE social_post_target_attempts ENABLE TRIGGER social_target_attempt_guard')
    await reconcile()
    await dispatch(ids)
    const post = (await pool.query('SELECT * FROM social_posts')).rows[0]
    expect(Object.keys(post.platform_results)).toHaveLength(2)
    expect(post.platform_results[`tiktok:${A}`]).toMatchObject({ status: 'success', providerStatus: 'PUBLISH_COMPLETE' })
    expect(post.platform_results[`facebook:${B}`]).toMatchObject({ status: 'unknown', providerStatus: 'dispatch_interrupted' })
    expect(post.status).toBe('unknown')
    expect(fixture.request.mock.calls.filter(([url]) => url.includes('/init/'))).toHaveLength(1)
    expect(fixture.request.mock.calls.filter(([url]) => url.includes('graph.facebook.com'))).toHaveLength(0)
  })
  it.each(['assignment', 'actor', 'client', 'role'])('I2 creator route rejects fresh revoked %s despite cached positive authority', async (mode) => {
    fixture.browserActor = STAFF
    await pool.query('CREATE SCHEMA task3_cache')
    await pool.query('CREATE TABLE task3_cache.client_team_assignments AS SELECT * FROM client_team_assignments')
    const cached = guardedSocialTask3Pool(dsn, { cached: true })
    fixture.db = socialTask3DbModule(pool, cached)
    if (mode === 'assignment') await pool.query('DELETE FROM client_team_assignments')
    if (mode === 'actor') await pool.query('UPDATE team_members SET is_active=FALSE WHERE id=$1', [STAFF])
    if (mode === 'client') await pool.query('UPDATE agency_clients SET is_active=FALSE')
    if (mode === 'role') await pool.query('UPDATE team_members SET user_role=\'viewer\' WHERE id=$1', [STAFF])
    vi.stubGlobal('defineEventHandler', (handler: any) => handler)
    vi.stubGlobal('getQuery', () => ({ clientId: C }))
    vi.stubGlobal('getRouterParam', () => A)
    vi.stubGlobal('createError', createError)
    const credentials = vi.spyOn(fixture.db, 'queryOneFresh')
    try {
      const route = (await import('~~/server/api/agency/social/publishing/accounts/[id]/creator-info.get')).default
      await expect(route(event())).rejects.toMatchObject({ statusCode: 403 })
      expect(fixture.request).not.toHaveBeenCalled()
      expect(credentials.mock.calls.filter(([sql]) => String(sql).includes('SELECT * FROM social_accounts'))).toHaveLength(0)
    } finally {
      await cached.end()
      fixture.db = socialTask3DbModule(pool)
      vi.unstubAllGlobals()
    }
  })
  it.each(['owner', 'admin'])('I2 preserves fresh %s browser access without assignment or signed MCP scope', async (role) => {
    fixture.browserActor = ADMIN
    await pool.query('UPDATE team_members SET user_role=$1 WHERE id=$2', [role, ADMIN])
    vi.stubGlobal('defineEventHandler', (h: any) => h)
    vi.stubGlobal('getQuery', () => ({ clientId: C }))
    vi.stubGlobal('getRouterParam', () => A)
    vi.stubGlobal('createError', createError)
    try {
      const { requireFreshSocialClientAccess } = await import('~~/server/utils/social/clientAccess')
      const access = await requireFreshSocialClientAccess(event(), C)
      expect(access.context.userRole).toBe(role)
      expect([...access.context.mcpScopes!]).toEqual([])
      const route = (await import('~~/server/api/agency/social/publishing/accounts/[id]/creator-info.get')).default
      await expect(route(event())).resolves.toMatchObject({ creator_username: 'fixture' })
    } finally { vi.unstubAllGlobals() }
  })
  it.each([{ content: 'Changed' }, { linkUrl: 'https://example.test/new' }, { hashtags: ['new'] }, { mediaAssets: [{ kind: 'banner_asset', id: 'aa000000-0000-4000-8000-000000000002' }] }])('I3 requires renewed consent after omitted-target patch %j', async (patch) => {
    const ids = await approved()
    await pool.query(`INSERT INTO banner_assets(id,name,mime_type,file_size,r2_key,url,uploaded_by,client_id)
      VALUES('aa000000-0000-4000-8000-000000000002','Other photo','image/jpeg',10,$1,'unused',$2,$3)`,
    [`banner-assets/${STAFF}/aa000000-0000-4000-8000-000000000002/photo.jpg`, STAFF, C])
    const { updateSocialPostDraft } = await import('~~/server/utils/socialPublishing/drafts')
    const { submitSocialPostForReview } = await import('~~/server/utils/socialPublishing/revisions')
    const actor = { actorId: STAFF, clientIds: [C], event: event() }
    await fixture.db.transaction((db: any) => updateSocialPostDraft(actor, ids.postId, patch, db))
    await expect(fixture.db.transaction((db: any) => submitSocialPostForReview(db, { event: event(), postId: ids.postId, requesterId: STAFF, clientIds: [C] }))).rejects.toThrow(/consent/i)
    const current = (await pool.query('SELECT * FROM social_posts WHERE id=$1', [ids.postId])).rows[0]
    const { resolveSocialMediaAssets } = await import('~~/server/utils/socialPublishing/mediaAssets')
    const { buildSocialPostSnapshot } = await import('~~/server/utils/socialPublishing/revisions')
    const { resolveEffectiveSocialTargets, tikTokConsentIdentity } = await import('~~/shared/socialEffectivePayload')
    const media = await resolveSocialMediaAssets({ event: event(), clientId: C, refs: current.media_asset_refs })
    const payload = resolveEffectiveSocialTargets(buildSocialPostSnapshot(current, media), media)[0]!
    await fixture.db.transaction((db: any) => updateSocialPostDraft(actor, ids.postId, { targets: [{ platform: 'tiktok', accountId: A, options: { ...payload.options, consent: true, consentPayload: tikTokConsentIdentity(payload, media) } }] }, db))
    await expect(fixture.db.transaction((db: any) => submitSocialPostForReview(db, { event: event(), postId: ids.postId, requesterId: STAFF, clientIds: [C] }))).resolves.toBeTruthy()
  })
  it('I3 retains consent for an unchanged exact payload', async () => {
    const ids = await approved()
    const { updateSocialPostDraft } = await import('~~/server/utils/socialPublishing/drafts')
    const { submitSocialPostForReview } = await import('~~/server/utils/socialPublishing/revisions')
    await fixture.db.transaction((db: any) => updateSocialPostDraft({ actorId: STAFF, clientIds: [C], event: event() }, ids.postId, { content: 'Exact reviewed copy' }, db))
    await expect(fixture.db.transaction((db: any) => submitSocialPostForReview(db, { event: event(), postId: ids.postId, requesterId: STAFF, clientIds: [C] }))).resolves.toBeTruthy()
  })
  it('I3 rejects changed media bytes and provider account identity before creator access', async () => {
    const ids = await approved()
    const { updateSocialPostDraft } = await import('~~/server/utils/socialPublishing/drafts')
    const { submitSocialPostForReview } = await import('~~/server/utils/socialPublishing/revisions')
    await fixture.db.transaction((db: any) => updateSocialPostDraft({ actorId: STAFF, clientIds: [C], event: event() }, ids.postId, { content: 'Exact reviewed copy' }, db))
    const changed = event()
    changed.context.cloudflare.env.MEDIA_BUCKET.head = async () => ({ size: 10, etag: 'replaced' })
    fixture.request.mockClear()
    await expect(fixture.db.transaction((db: any) => submitSocialPostForReview(db, { event: changed, postId: ids.postId, requesterId: STAFF, clientIds: [C] }))).rejects.toThrow(/consent/)
    await pool.query('UPDATE social_accounts SET platform_account_id=\'different-creator\'')
    await expect(fixture.db.transaction((db: any) => submitSocialPostForReview(db, { event: event(), postId: ids.postId, requesterId: STAFF, clientIds: [C] }))).rejects.toThrow(/renew consent/)
    expect(fixture.request).not.toHaveBeenCalled()
  })
  it('enforces 35 TikTok photos without changing other provider storage limits', async () => {
    const refs = Array.from({ length: 35 }, () => ({ kind: 'banner_asset', id: randomUUID() }))
    await pool.query('INSERT INTO social_posts(client_id,platforms,media_asset_refs) VALUES($1,ARRAY[\'tiktok\'],$2)', [C, JSON.stringify(refs)])
    await expect(pool.query('INSERT INTO social_posts(client_id,platforms,media_asset_refs) VALUES($1,ARRAY[\'facebook\'],$2)', [C, JSON.stringify(refs)])).rejects.toThrow('social_posts_media_asset_refs_check')
  })
})
