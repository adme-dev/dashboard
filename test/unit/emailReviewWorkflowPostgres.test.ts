/* eslint-disable @typescript-eslint/no-explicit-any -- partial PostgreSQL fixture and dependency mock shapes */
/**
 * M06 review workflow against real PostgreSQL: migration 497 executed verbatim
 * (twice, for idempotency) on minimal pre-497 table shapes. Skipped unless
 * EMAIL_REVIEW_PG_URL points at a LOCAL scratch database (never a configured one):
 *
 *   initdb -D /tmp/xf-review-pg -U postgres -A trust
 *   pg_ctl -D /tmp/xf-review-pg -o "-p 54397 -k /tmp -c listen_addresses=''" start
 *   EMAIL_REVIEW_PG_URL='postgresql:///postgres?host=/tmp&port=54397&user=postgres' \
 *     pnpm exec vitest run --cache=false test/unit/emailReviewWorkflowPostgres.test.ts
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'

const url = process.env.EMAIL_REVIEW_PG_URL
function isLocal(value?: string): boolean {
  if (!value) return false
  try {
    const parsed = new URL(value)
    const socket = parsed.searchParams.get('host')
    return ['', 'localhost', '127.0.0.1'].includes(parsed.hostname) && (!socket || socket.startsWith('/'))
  } catch {
    return false
  }
}
const local = isLocal(url)

const h = vi.hoisted(() => ({
  pool: null as null | import('pg').Pool,
  ambiguous: new WeakSet<object>()
}))

vi.mock('~~/server/utils/db', () => {
  const rows = async (sql: string, params?: unknown[]) => (await h.pool!.query(sql, params as any[])).rows
  const tx = async (cb: (db: unknown) => Promise<unknown>) => {
    const client = await h.pool!.connect()
    try {
      await client.query('BEGIN')
      const result = await cb(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }
  return {
    queryRows: rows,
    queryRowsFresh: rows,
    queryOne: async (s: string, p?: unknown[]) => (await rows(s, p))[0] ?? null,
    queryOneFresh: async (s: string, p?: unknown[]) => (await rows(s, p))[0] ?? null,
    execute: async (s: string, p?: unknown[]) => { await h.pool!.query(s, p as any[]) },
    transaction: tx,
    transactionWithoutRetry: tx,
    getTransactionFailureStage: (error: unknown) => (error && typeof error === 'object' && h.ambiguous.has(error) ? 'ambiguous_commit' : null)
  }
})

const { runReviewCommand, readReviewOperation, getReviewView, assertCampaignApprovalCurrent } = await import('../../server/utils/email-marketing/review')
const campaigns = await import('../../server/utils/email-marketing/campaigns')
const { WEB_VERSION_ROW_SQL, webVersionAvailable } = await import('../../server/utils/email-marketing/webVersion')

const CLIENT_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const CLIENT_B = 'bbbbbbbb-0000-4000-8000-000000000002'
const AUTHOR = 'cccccccc-0000-4000-8000-000000000003'
const REVIEWER = 'dddddddd-0000-4000-8000-000000000004'

type Authority = 'read' | 'write' | 'review'
function authorizer(allowed: Authority[] = ['read', 'write', 'review'], clients: Array<string | null> = [CLIENT_A, CLIENT_B, null]) {
  const calls: Array<[Authority, string | null]> = []
  const fn = async (authority: Authority, clientId: string | null) => {
    calls.push([authority, clientId])
    if (!allowed.includes(authority) || !clients.includes(clientId)) throw Object.assign(new Error('denied'), { statusCode: 403, statusMessage: 'design_access_denied' })
  }
  return Object.assign(fn, { calls })
}

// Plain functions: the shared setup resets vi.fn implementations between tests.
const renders = { count: 0 }
const renderer = {
  renderDocument: async (doc: any, options: any = {}) => {
    renders.count += 1
    return `<html><body><h1>${options.subjectLine ?? ''}</h1>${Object.keys(doc).sort().join(',')}<a href="{{unsubscribe_url}}">Unsubscribe</a></body></html>`
  },
  renderCustomerPreview: async () => { throw new Error('unused') }
}

function doc(blocks: string[] = ['hero', 'body']) {
  const out: Record<string, unknown> = { root: { type: 'EmailLayout', data: { childrenIds: blocks } } }
  for (const id of blocks) out[id] = { type: 'Text', data: { props: { text: `Copy for ${id}` } } }
  return out
}

let seq = 0
function opId(): string {
  seq += 1
  return `eeeeeeee-0000-4000-8000-${seq.toString().padStart(12, '0')}`
}

async function q(sql: string, params: unknown[] = []) {
  return (await h.pool!.query(sql, params as any[])).rows
}

async function view(kind: 'campaign' | 'template', id: string) {
  return getReviewView(kind, id, undefined, authorizer())
}

async function command(kind: 'campaign' | 'template', id: string, payload: any, overrides: Record<string, unknown> = {}, auth = authorizer(), deps: any = {}) {
  const current = await view(kind, id)
  return runReviewCommand({
    actorId: payload.command === 'approve' || payload.command === 'request_changes' ? REVIEWER : AUTHOR,
    operationId: opId(),
    kind,
    targetId: id,
    expectedClientId: current.clientId,
    expectedVersion: current.version,
    expectedContentDigest: current.contentDigest,
    payload,
    ...overrides
  } as any, auth, deps)
}

async function newCampaign(clientId: string | null = CLIENT_A, workflow = true) {
  const previous = process.env.FIGFLOW_EDM_WORKFLOW_ENABLED
  process.env.FIGFLOW_EDM_WORKFLOW_ENABLED = workflow ? 'true' : 'false'
  try {
    return await campaigns.createCampaign({
      name: 'Spring', subject: 'Spring sale', from_name: 'ADME', from_email: 'news@adme.example', body_source: doc(), client_id: clientId, created_by: AUTHOR
    } as any, renderer as any)
  } finally {
    if (previous === undefined) delete process.env.FIGFLOW_EDM_WORKFLOW_ENABLED
    else process.env.FIGFLOW_EDM_WORKFLOW_ENABLED = previous
  }
}

async function approve(kind: 'campaign' | 'template', id: string) {
  await command(kind, id, { command: 'submit' })
  return command(kind, id, { command: 'approve' })
}

const fetchSpy = vi.spyOn(globalThis, 'fetch')

describe.skipIf(!local)('M06 review workflow on PostgreSQL', () => {
  const dbName = `xf_review_${process.pid}`
  let admin: import('pg').Client
  let legacyScheduled: string

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: url })
    await admin.connect()
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`)
    await admin.query(`CREATE DATABASE ${dbName}`)
    const target = new URL(url!)
    target.pathname = `/${dbName}`
    h.pool = new pg.Pool({ connectionString: target.toString(), max: 6 })
    await h.pool.query(readFileSync('test/fixtures/email-review/bootstrap.sql', 'utf8'))
    // A legacy campaign already scheduled before the migration ships.
    legacyScheduled = (await q(`INSERT INTO campaigns (name, subject, body_html, status, client_id, scheduled_at)
      VALUES ('Legacy', 'Old', '<p>frozen legacy</p>', 'scheduled', $1, now() + interval '1 day') RETURNING id`, [CLIENT_A]))[0].id
    const migration = readFileSync('server/database/migrations/497_email_review_workflow.sql', 'utf8')
    await h.pool.query(migration)
    await h.pool.query(migration)
    await q('INSERT INTO team_members (id, name) VALUES ($1, $2), ($3, $4)', [AUTHOR, 'Author', REVIEWER, 'Reviewer'])
  })

  afterAll(async () => {
    await h.pool?.end()
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName}`)
    await admin?.end()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  beforeEach(() => {
    renders.count = 0
  })

  describe('legacy frozen dispatches are preserved', () => {
    it('existing scheduled campaigns stay ungated, unrewritten and never reclassified as approved', async () => {
      const [row] = await q('SELECT review_required, body_html, status FROM campaigns WHERE id = $1', [legacyScheduled])
      expect(row).toMatchObject({ review_required: false, body_html: '<p>frozen legacy</p>', status: 'scheduled' })
      await campaigns.setCampaignStatus(legacyScheduled, 'sending')
      await campaigns.setCampaignStatus(legacyScheduled, 'sent')
      expect(await q('SELECT 1 FROM email_review_states WHERE target_id = $1', [legacyScheduled])).toHaveLength(0)
      for (const payload of [{ command: 'submit' }, { command: 'require_review' }]) {
        await expect(command('campaign', legacyScheduled, payload)).rejects.toMatchObject({ statusCode: 409, statusMessage: 'review_target_frozen' })
      }
      const legacy = await view('campaign', legacyScheduled)
      expect(legacy).toMatchObject({ reviewRequired: false, state: 'draft', approvalCurrent: false })
    })

    it('flag-off campaigns keep the historical behaviour and HTML preparation', async () => {
      const campaign = await newCampaign(CLIENT_A, false)
      expect(campaign.review_required).toBe(false)
      await campaigns.setCampaignStatus(campaign.id, 'sending')
      await expect(assertCampaignApprovalCurrent(campaign)).resolves.toBeUndefined()
    })
  })

  describe('universal campaign gate (REST, MCP, cron and raw SQL share the trigger)', () => {
    it('workflow-created campaigns require approval regardless of template or entrypoint', async () => {
      const campaign = await newCampaign()
      expect(campaign.review_required).toBe(true)
      expect(campaign.template_id).toBeNull()
      await expect(campaigns.setCampaignStatus(campaign.id, 'scheduled')).rejects.toMatchObject({ statusCode: 409, statusMessage: 'campaign_approval_required' })
      await expect(q('UPDATE campaigns SET status = \'sending\' WHERE id = $1', [campaign.id])).rejects.toMatchObject({ constraint: 'email_campaign_approval_required' })
      await expect(q('UPDATE campaigns SET status = \'sent\' WHERE id = $1', [campaign.id])).rejects.toMatchObject({ constraint: 'email_campaign_approval_required' })
      await expect(q('UPDATE campaigns SET review_required = false WHERE id = $1', [campaign.id])).rejects.toMatchObject({ constraint: 'email_campaign_review_permanent' })
      await expect(q('INSERT INTO campaigns (name, status, review_required) VALUES (\'x\', \'scheduled\', true)')).rejects.toMatchObject({ constraint: 'email_campaign_approval_required' })
      // A self-declared state row for a different digest is not an approval.
      await q(`INSERT INTO email_review_states (target_kind, target_id, state, content_digest, decided_by, decided_at)
        VALUES ('campaign', $1, 'approved', $2, $3, now())`, [campaign.id, 'f'.repeat(64), REVIEWER])
      await expect(q('UPDATE campaigns SET status = \'scheduled\' WHERE id = $1', [campaign.id])).rejects.toMatchObject({ constraint: 'email_campaign_approval_required' })
      // Cancelling an unapproved draft stays possible.
      await campaigns.setCampaignStatus(campaign.id, 'cancelled')
    })

    it('approval of the exact content allows scheduling; the scheduled snapshot is then frozen', async () => {
      const campaign = await newCampaign()
      const approved = await approve('campaign', campaign.id)
      expect(approved).toMatchObject({ state: 'approved', command: 'approve' })
      await expect(assertCampaignApprovalCurrent({ id: campaign.id, review_required: true })).resolves.toBeUndefined()
      await campaigns.setCampaignStatus(campaign.id, 'scheduled')
      await expect(q('UPDATE campaigns SET body_html = \'<p>swap</p>\' WHERE id = $1', [campaign.id])).rejects.toMatchObject({ constraint: 'email_campaign_content_frozen' })
      await expect(q('UPDATE campaigns SET utm_settings = \'{"source":"x"}\' WHERE id = $1', [campaign.id])).rejects.toMatchObject({ constraint: 'email_campaign_content_frozen' })
      await expect(campaigns.updateCampaign(campaign.id, { subject: 'New' }, renderer as any)).rejects.toMatchObject({ statusCode: 409 })
      // Frozen reviewed campaigns are never re-prepared (no mirroring/recompile).
      const frozen = (await q('SELECT * FROM campaigns WHERE id = $1', [campaign.id]))[0]
      expect(await campaigns.prepareCampaignHtmlForSend(frozen, { fetchAsset: vi.fn(), uploadAsset: vi.fn() } as any)).toBe(frozen)
      await expect(command('campaign', campaign.id, { command: 'request_changes', note: 'late' })).rejects.toMatchObject({ statusMessage: 'review_target_frozen' })
      await campaigns.setCampaignStatus(campaign.id, 'sending')
      expect((await view('campaign', campaign.id)).approvalCurrent).toBe(true)
    })

    it('MCP department send refuses before any side effect when approval is missing', async () => {
      const campaign = await newCampaign()
      const client = await h.pool!.connect()
      try {
        await expect(assertCampaignApprovalCurrent(campaign as any, client as any)).rejects.toMatchObject({ statusMessage: 'campaign_approval_required' })
      } finally {
        client.release()
      }
    })
  })

  describe('approval invalidation', () => {
    it('any relevant mutation (body, subject, sender, UTM, web version) returns the review to draft', async () => {
      const mutations: Array<[string, (id: string) => Promise<unknown>]> = [
        ['subject', id => campaigns.updateCampaign(id, { subject: 'Changed' }, renderer as any)],
        ['body', id => campaigns.updateCampaign(id, { body_source: doc(['hero']) }, renderer as any)],
        ['sender', id => campaigns.updateCampaign(id, { from_email: 'other@adme.example' }, renderer as any)],
        ['utm', id => campaigns.updateCampaign(id, { utm_settings: { source: 'news' } }, renderer as any)],
        ['web version', id => campaigns.updateCampaign(id, { web_version_enabled: true }, renderer as any)],
        ['raw sql', id => q('UPDATE campaigns SET preview_text = \'pre\' WHERE id = $1', [id])]
      ]
      for (const [label, mutate] of mutations) {
        const campaign = await newCampaign()
        const approved = await approve('campaign', campaign.id)
        await mutate(campaign.id)
        const current = await view('campaign', campaign.id)
        expect(current.state, label).toBe('draft')
        expect(current.version, label).toBe(approved.version + 1)
        expect(current.note, label).toMatch(/Content changed/)
        await expect(campaigns.setCampaignStatus(campaign.id, 'scheduled'), label).rejects.toMatchObject({ statusMessage: 'campaign_approval_required' })
      }
    })

    it('a rename or audience change does not touch approved HTML or approval', async () => {
      const campaign = await newCampaign()
      await approve('campaign', campaign.id)
      const before = (await q('SELECT body_html FROM campaigns WHERE id = $1', [campaign.id]))[0].body_html
      renders.count = 0
      await campaigns.updateCampaign(campaign.id, { name: 'Renamed' }, renderer as any)
      expect(renders.count).toBe(0)
      expect((await q('SELECT body_html FROM campaigns WHERE id = $1', [campaign.id]))[0].body_html).toBe(before)
      expect((await view('campaign', campaign.id)).approvalCurrent).toBe(true)
    })

    it('templates bind the canonical revision identity too', async () => {
      const template = (await q(`INSERT INTO edm_templates (name, subject, body_source, body_html, client_id, email_design_revision_id)
        VALUES ('T', 'S', $1::jsonb, '<p>t</p>', $2, $3) RETURNING id`, [JSON.stringify(doc()), CLIENT_A, '99999999-0000-4000-8000-000000000001']))[0].id
      await approve('template', template)
      expect((await view('template', template)).approvalCurrent).toBe(true)
      await q('UPDATE edm_templates SET email_design_revision_id = $2 WHERE id = $1', [template, '99999999-0000-4000-8000-000000000002'])
      expect(await view('template', template)).toMatchObject({ state: 'draft', approvalCurrent: false })
    })
  })

  describe('stale and concurrent review commands', () => {
    it('rejects a stale content digest or version without changing state', async () => {
      const campaign = await newCampaign()
      const stale = await view('campaign', campaign.id)
      await campaigns.updateCampaign(campaign.id, { subject: 'Edited meanwhile' }, renderer as any)
      await expect(command('campaign', campaign.id, { command: 'submit' }, { expectedContentDigest: stale.contentDigest })).rejects.toMatchObject({ statusCode: 409, statusMessage: 'review_content_changed' })
      await expect(command('campaign', campaign.id, { command: 'submit' }, { expectedVersion: 7 })).rejects.toMatchObject({ statusCode: 409, statusMessage: 'review_state_changed' })
      expect((await view('campaign', campaign.id)).version).toBe(0)
    })

    it('two reviewers acting on the same version: exactly one wins', async () => {
      const campaign = await newCampaign()
      await command('campaign', campaign.id, { command: 'submit' })
      const seen = await view('campaign', campaign.id)
      const fire = (payload: any) => runReviewCommand({
        actorId: REVIEWER, operationId: opId(), kind: 'campaign', targetId: campaign.id, expectedClientId: CLIENT_A,
        expectedVersion: seen.version, expectedContentDigest: seen.contentDigest, payload
      }, authorizer())
      const results = await Promise.allSettled([fire({ command: 'approve' }), fire({ command: 'request_changes', note: 'no' })])
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
      const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult
      expect(rejected.reason).toMatchObject({ statusCode: 409, statusMessage: 'review_state_changed' })
      expect((await view('campaign', campaign.id)).version).toBe(seen.version + 1)
    })

    it('approve requires in_review of the exact digest (no approve-from-draft)', async () => {
      const campaign = await newCampaign()
      await expect(command('campaign', campaign.id, { command: 'approve' })).rejects.toMatchObject({ statusMessage: 'review_not_in_review' })
    })
  })

  describe('authorization, revocation and cross-client attempts', () => {
    it('approval needs the agency review authority; staff write grants are not enough', async () => {
      const campaign = await newCampaign()
      await command('campaign', campaign.id, { command: 'submit' }, {}, authorizer(['read', 'write']))
      await expect(command('campaign', campaign.id, { command: 'approve' }, {}, authorizer(['read', 'write']))).rejects.toMatchObject({ statusCode: 403 })
      expect((await view('campaign', campaign.id)).state).toBe('in_review')
      expect(await q('SELECT 1 FROM email_review_operations WHERE target_id = $1 AND command = \'approve\'', [campaign.id])).toHaveLength(0)
      const canReview = await getReviewView('campaign', campaign.id, CLIENT_A, authorizer(['read', 'write']))
      expect(canReview.canReview).toBe(false)
    })

    it('authority is checked against the stored owner; a mismatched scope looks absent', async () => {
      const campaign = await newCampaign(CLIENT_B)
      const auth = authorizer()
      await expect(command('campaign', campaign.id, { command: 'submit' }, { expectedClientId: CLIENT_A }, auth)).rejects.toMatchObject({ statusCode: 404, statusMessage: 'review_target_not_found' })
      // The scope mismatch is refused before any authority or state is touched.
      expect(auth.calls).toEqual([])
      await expect(getReviewView('campaign', campaign.id, CLIENT_A, authorizer())).rejects.toMatchObject({ statusCode: 404 })
      await expect(command('campaign', campaign.id, { command: 'comment', blockId: null, parentId: null, body: 'x' }, {}, authorizer(['read', 'write', 'review'], [CLIENT_A]))).rejects.toMatchObject({ statusCode: 403 })
      expect(await q('SELECT 1 FROM email_review_comments WHERE target_id = $1', [campaign.id])).toHaveLength(0)
    })

    it('replays and readbacks re-check fresh authority (revocation wins)', async () => {
      const campaign = await newCampaign()
      const seen = await view('campaign', campaign.id)
      const input = { actorId: AUTHOR, operationId: opId(), kind: 'campaign' as const, targetId: campaign.id, expectedClientId: CLIENT_A, expectedVersion: seen.version, expectedContentDigest: seen.contentDigest, payload: { command: 'submit' as const } }
      await runReviewCommand(input, authorizer())
      const revoked = authorizer([], [])
      await expect(runReviewCommand(input, revoked)).rejects.toMatchObject({ statusCode: 403 })
      await expect(readReviewOperation(AUTHOR, input.operationId, revoked)).rejects.toMatchObject({ statusCode: 403 })
    })
  })

  describe('operation receipts', () => {
    it('identical retries replay; reuse for another command, target or payload is rejected', async () => {
      const first = await newCampaign()
      const second = await newCampaign()
      const seen = await view('campaign', first.id)
      const operationId = opId()
      const input = { actorId: AUTHOR, operationId, kind: 'campaign' as const, targetId: first.id, expectedClientId: CLIENT_A, expectedVersion: seen.version, expectedContentDigest: seen.contentDigest, payload: { command: 'comment' as const, blockId: 'hero', parentId: null, body: 'Check date' } }
      const original = await runReviewCommand(input, authorizer())
      const replay = await runReviewCommand(input, authorizer())
      expect(replay).toEqual({ ...original, replayed: true })
      expect(await q('SELECT 1 FROM email_review_comments WHERE target_id = $1', [first.id])).toHaveLength(1)
      const other = await view('campaign', second.id)
      for (const reuse of [
        { ...input, targetId: second.id, expectedContentDigest: other.contentDigest },
        { ...input, payload: { command: 'submit' as const } },
        { ...input, payload: { ...input.payload, body: 'Different' } },
        { ...input, kind: 'template' as const }
      ]) {
        await expect(runReviewCommand(reuse as any, authorizer())).rejects.toMatchObject({ statusCode: reuse.kind === 'template' ? 404 : 409 })
      }
      await expect(q('UPDATE email_review_operations SET command = \'approve\'')).rejects.toThrow(/immutable/)
      await expect(q('DELETE FROM email_review_operations')).rejects.toThrow(/immutable/)
    })

    it('a lost reply after commit is recovered from the receipt, never re-executed', async () => {
      const campaign = await newCampaign()
      const seen = await view('campaign', campaign.id)
      const input = { actorId: AUTHOR, operationId: opId(), kind: 'campaign' as const, targetId: campaign.id, expectedClientId: CLIENT_A, expectedVersion: seen.version, expectedContentDigest: seen.contentDigest, payload: { command: 'submit' as const } }
      const { transactionWithoutRetry } = await import('~~/server/utils/db') as any
      const committedThenLost = async (work: any) => {
        await transactionWithoutRetry(work)
        const error = new Error('socket closed during COMMIT reply')
        h.ambiguous.add(error)
        throw error
      }
      const recovered = await runReviewCommand(input, authorizer(), { transaction: committedThenLost })
      expect(recovered).toMatchObject({ state: 'in_review', replayed: true })
      expect(await readReviewOperation(AUTHOR, input.operationId, authorizer())).toMatchObject({ state: 'in_review', operationId: input.operationId })
      expect((await view('campaign', campaign.id)).version).toBe(1)
    })

    it('an unknown outcome that did not commit reports 503 and the identical retry applies once', async () => {
      const campaign = await newCampaign()
      const seen = await view('campaign', campaign.id)
      const input = { actorId: AUTHOR, operationId: opId(), kind: 'campaign' as const, targetId: campaign.id, expectedClientId: CLIENT_A, expectedVersion: seen.version, expectedContentDigest: seen.contentDigest, payload: { command: 'submit' as const } }
      const rolledBackUnknown = async () => {
        const error = new Error('connection reset before COMMIT acknowledged')
        h.ambiguous.add(error)
        throw error
      }
      await expect(runReviewCommand(input, authorizer(), { transaction: rolledBackUnknown })).rejects.toMatchObject({ statusCode: 503, statusMessage: 'review_outcome_unknown' })
      expect(await readReviewOperation(AUTHOR, input.operationId, authorizer())).toBeNull()
      expect(await runReviewCommand(input, authorizer())).toMatchObject({ state: 'in_review' })
      expect(await runReviewCommand(input, authorizer())).toMatchObject({ state: 'in_review', replayed: true })
      expect((await view('campaign', campaign.id)).version).toBe(1)
    })
  })

  describe('submit-time preparation', () => {
    it('binds the prepared (sendable) digest so later idempotent preparation cannot invalidate approval', async () => {
      const campaign = await newCampaign()
      const prepare = vi.fn(async () => {
        await q('UPDATE campaigns SET body_html = body_html || \'<!-- mirrored -->\' WHERE id = $1', [campaign.id])
      })
      const failing = () => vi.fn(async () => {
        throw new Error('fetch failed')
      })
      const submitted = await command('campaign', campaign.id, { command: 'submit' }, {}, authorizer(), { prepareSubmission: prepare })
      expect(prepare).toHaveBeenCalledTimes(1)
      expect(submitted.contentDigest).toBe((await view('campaign', campaign.id)).contentDigest)
      await expect(command('campaign', campaign.id, { command: 'submit' }, {}, authorizer(), { prepareSubmission: failing() }))
        .rejects.toMatchObject({ statusCode: 409, statusMessage: 'review_not_draft' })
      const other = await newCampaign()
      await expect(command('campaign', other.id, { command: 'submit' }, {}, authorizer(), { prepareSubmission: failing() }))
        .rejects.toMatchObject({ statusCode: 502, statusMessage: 'campaign_asset_preparation_failed' })
      expect((await view('campaign', other.id)).state).toBe('draft')
    })
  })

  describe('block comments and lineage', () => {
    it('anchors to block ID + content identity; deleted blocks become explicit orphans', async () => {
      const campaign = await newCampaign()
      const root = await command('campaign', campaign.id, { command: 'comment', blockId: 'hero', parentId: null, body: '  Swap the hero image  ' })
      await command('campaign', campaign.id, { command: 'comment', blockId: 'hero', parentId: root.commentId, body: 'Done' })
      await command('campaign', campaign.id, { command: 'comment', blockId: null, parentId: null, body: 'Overall looks good' })
      await expect(command('campaign', campaign.id, { command: 'comment', blockId: 'missing', parentId: null, body: 'x' })).rejects.toMatchObject({ statusCode: 422, statusMessage: 'review_block_not_found' })
      await expect(command('campaign', campaign.id, { command: 'comment', blockId: 'body', parentId: root.commentId, body: 'x' })).rejects.toMatchObject({ statusCode: 422, statusMessage: 'review_thread_not_found' })
      const reply = (await q('SELECT id FROM email_review_comments WHERE parent_id = $1', [root.commentId]))[0].id
      await expect(command('campaign', campaign.id, { command: 'comment', blockId: 'hero', parentId: reply, body: 'nested' })).rejects.toMatchObject({ statusCode: 422 })

      const before = await view('campaign', campaign.id)
      const hero = before.comments.find(c => c.id === root.commentId)!
      expect(hero).toMatchObject({ blockId: 'hero', body: 'Swap the hero image', orphaned: false, outdated: false, authorName: 'Author' })
      expect(hero.contentDigest).toBe(before.contentDigest)

      await campaigns.updateCampaign(campaign.id, { body_source: doc(['body', 'cta']) }, renderer as any)
      const after = await view('campaign', campaign.id)
      const orphan = after.comments.find(c => c.id === root.commentId)!
      expect(orphan).toMatchObject({ blockId: 'hero', orphaned: true, outdated: true })
      expect(after.comments.find(c => c.blockId === null)).toMatchObject({ orphaned: false, outdated: true })
      expect(after.blocks.map(b => b.id)).toEqual(['body', 'cta'])

      await expect(q('UPDATE email_review_comments SET block_id = \'body\' WHERE id = $1', [root.commentId])).rejects.toThrow(/lineage is immutable/)
      await expect(q('UPDATE email_review_comments SET body = \'rewritten\' WHERE id = $1', [root.commentId])).rejects.toThrow(/lineage is immutable/)
      await expect(q('DELETE FROM email_review_comments WHERE id = $1', [root.commentId])).rejects.toThrow(/cannot be deleted/)

      await command('campaign', campaign.id, { command: 'resolve_comment', commentId: root.commentId, resolved: true })
      expect((await view('campaign', campaign.id)).comments.find(c => c.id === root.commentId)!.resolvedAt).not.toBeNull()
      // Comments never change review state or content.
      expect((await view('campaign', campaign.id)).state).toBe('draft')
    })

    it('template comments record the canonical revision they were written against', async () => {
      const revision = '99999999-0000-4000-8000-000000000009'
      const template = (await q(`INSERT INTO edm_templates (name, body_source, body_html, client_id, email_design_revision_id)
        VALUES ('T2', $1::jsonb, '<p>t</p>', $2, $3) RETURNING id`, [JSON.stringify(doc()), CLIENT_A, revision]))[0].id
      const result = await command('template', template, { command: 'comment', blockId: 'body', parentId: null, body: 'Font size?' })
      expect((await q('SELECT revision_id FROM email_review_comments WHERE id = $1', [result.commentId]))[0].revision_id).toBe(revision)
    })
  })

  describe('hosted web version identity', () => {
    it('is served only for the exact frozen digest of an opted-in campaign', async () => {
      const campaign = await newCampaign()
      await campaigns.updateCampaign(campaign.id, { web_version_enabled: true, utm_settings: { source: 'news' } }, renderer as any)
      const approved = await approve('campaign', campaign.id)
      const draftRow = (await q(WEB_VERSION_ROW_SQL, [campaign.id]))[0]
      expect(draftRow.digest).toBe(approved.contentDigest)
      expect(webVersionAvailable(draftRow, { campaignId: campaign.id, contentDigest: approved.contentDigest })).toBe(false)
      await campaigns.setCampaignStatus(campaign.id, 'scheduled')
      const frozenRow = (await q(WEB_VERSION_ROW_SQL, [campaign.id]))[0]
      expect(webVersionAvailable(frozenRow, { campaignId: campaign.id, contentDigest: approved.contentDigest })).toBe(true)
      expect(webVersionAvailable(frozenRow, { campaignId: campaign.id, contentDigest: 'f'.repeat(64) })).toBe(false)
    })
  })
})
