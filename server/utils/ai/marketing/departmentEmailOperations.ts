/**
 * Marketing department email marketing over MCP. Uses the application's own campaign records,
 * renderer, consent-aware recipient materialization, send preflight, hard send gate and chunked
 * campaign sender — no parallel campaign system. Every call re-resolves fresh MARKETING_MANAGEMENT +
 * department grant and the active client; campaigns and their lists must belong to that client.
 *
 * External-audience sends are proposal → independent review → execution. The proposal freezes the
 * exact content (subject, sender, reply-to, preview, rendered HTML), audience (lists + segment), the
 * materialized recipient set and the sender identity; review and execution refuse if any of that
 * changed. Execution claims the ledger durably before any provider I/O, holds interrupted sends for
 * reconciliation (no blind retry) and leaves Resend message ids where the sender records them
 * (campaign_recipients.resend_message_id + email_events).
 */
import type { z } from 'zod'
import type { H3Event } from 'h3'
import { queryOneFresh, queryRowsFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { requireMarketingDepartment } from './departmentAuthority'
import { resolveMarketingReadScope, requireScopedClient } from './readScope'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'
import {
  departmentEmailContracts, DEPARTMENT_EMAIL_WRITE_NAMES, EMAIL_SEND_PROPOSAL_ACTION, type DepartmentEmailToolName
} from './departmentEmailSchemas'
import {
  claimExecution, claimOutcome, finishExecution, refuse, refusalOf, sha256, validExecutionIdentity,
  type ExecutionIdentity, type LedgerDb
} from './departmentExecutionLedger'
import type { Campaign } from '~~/server/utils/email-marketing/campaigns'
import type { EmailRendererClient } from '../../../../shared/emailRendering/contract'

type Args<N extends DepartmentEmailToolName> = z.infer<(typeof departmentEmailContracts)[N]>
const WRITES = new Set<string>(DEPARTMENT_EMAIL_WRITE_NAMES)
/** Batches per execution call (100 recipients each); larger campaigns continue on the next call. */
const MAX_CHUNKS_PER_CALL = 20
const PROPOSAL_TTL_HOURS = 24
const MAX_BODY_SOURCE_READ_BYTES = 64 * 1024

export interface DepartmentEmailDeps {
  sendingEnabled?: (event: H3Event) => boolean
  sendingConfigured?: (event: H3Event) => boolean
  senderDomains?: (event: H3Event) => string[]
  renderer?: (ctx: ToolContext) => EmailRendererClient
  materialize?: (campaignId: string, opts: { appUrl?: string, userId?: string }) => Promise<number>
  runSend?: (campaign: Campaign, opts: { prepareHtml?: boolean, maxChunks?: number, event?: H3Event }) => Promise<SendRun>
  sendTest?: (event: H3Event, input: { campaign: Campaign, to: string, name?: string | null, userId: string, onDispatchStart?: () => void }) => Promise<{ sentTo: string, providerMessageId: string | null }>
  requireReviewer?: (event: H3Event, input: { requesterId: string, clientId: string, reviewerId: string }) => Promise<unknown>
  assertRequester?: (event: H3Event, requesterId: string, clientId: string) => Promise<void>
}

interface SendRun { sent: number, failed: number, remaining: number, drained: boolean, rateLimited: boolean, retryAfterSec: number }
interface Freeze {
  campaignId: string
  clientId: string
  contentHash: string
  audienceHash: string
  recipientsHash: string
  recipientCount: number
  fromEmail: string | null
  senderDomain: string | null
  provider: 'resend'
}
interface Review { reviewerId: string, decision: 'approve' | 'reject', reason: string, freezeRevision: string, reviewedAt: string }
interface ProposalPayload {
  kind: typeof EMAIL_SEND_PROPOSAL_ACTION
  clientId: string
  campaignId: string
  freeze: Freeze
  freezeRevision: string
  requestKey: string
  review: Review | null
  execution: { startedBy: string, startedAt: string, runs: number, lastRunKey: string } | null
}
interface ProposalRow {
  id: string
  user_id: string
  status: string
  expires_at: string
  resolved_payload: ProposalPayload
  result_payload: Record<string, unknown> | null
}
interface ListRow { id: string, name: string, client_id: string | null }

// ---------------------------------------------------------------------------------- authority

async function authorize(ctx: ToolContext, clientId: string, write: boolean): Promise<ToolContext> {
  const fresh = await requireMarketingDepartment(ctx, write)
  await requireScopedClient(await resolveMarketingReadScope(fresh), clientId)
  return fresh
}

async function defaultAssertRequester(event: H3Event, requesterId: string, clientId: string): Promise<void> {
  const { assertMarketingCapabilityAtBoundary } = await import('./reviewAuthority')
  const requester = await assertMarketingCapabilityAtBoundary(event, requesterId, clientId, 'department_management')
  if (!requester.permissionGroups?.includes('MARKETING_MANAGEMENT')) refuse('Requester no longer has department authority', 'forbidden')
}
async function defaultRequireReviewer(event: H3Event, input: { requesterId: string, clientId: string, reviewerId: string }) {
  const { requireIndependentMarketingReviewer } = await import('./reviewAuthority')
  return requireIndependentMarketingReviewer(event, input)
}

// ------------------------------------------------------------------------------- runtime gates

// Request bindings (ctx.event) override process.env, which is only a local fallback.
async function sendingEnabled(deps: DepartmentEmailDeps, event: H3Event): Promise<boolean> {
  if (deps.sendingEnabled) return deps.sendingEnabled(event)
  return (await import('~~/server/utils/email-marketing/campaignSender')).isCampaignSendingEnabled(event)
}
async function preflightFor(campaign: Campaign, toSend: number, event: H3Event, deps: DepartmentEmailDeps) {
  const { buildCampaignPreflight } = await import('~~/server/utils/email-marketing/campaignSend')
  const configured = deps.sendingConfigured ? deps.sendingConfigured(event) : (await import('~~/server/utils/email')).isEmailConfigured(event)
  const domains = deps.senderDomains ? deps.senderDomains(event) : (await import('~~/server/utils/email-marketing/senderIdentity')).resolveCampaignSenderDomains(event)
  return buildCampaignPreflight({ campaign, toSend, sendingConfigured: configured, senderDomainAuthenticated: configured, allowedSenderDomains: domains })
}
async function rendererFor(ctx: ToolContext, deps: DepartmentEmailDeps): Promise<EmailRendererClient> {
  if (deps.renderer) return deps.renderer(ctx)
  const { createEmailRenderer } = await import('~~/server/utils/email-marketing/render/client')
  // MCP calls carry the Cloudflare bindings on the request event (no browser session involved).
  const env = (ctx.event as { context?: { cloudflare?: { env?: Record<string, unknown> } } })?.context?.cloudflare?.env ?? {}
  return createEmailRenderer(env)
}

// ------------------------------------------------------------------------------ campaign state

const freshDb: LedgerDb = { query: async (sql, params) => ({ rows: await queryRowsFresh(sql, params as unknown[]) }) }

async function campaignState(db: LedgerDb, campaignId: string, clientId: string, lock: 'update' | 'share' | null) {
  const locking = lock === 'update' ? 'FOR UPDATE OF c' : lock === 'share' ? 'FOR SHARE OF c' : ''
  const campaign = (await db.query(`SELECT c.* FROM campaigns c
    JOIN agency_clients ac ON ac.id = c.client_id AND ac.is_active = TRUE
    WHERE c.id = $1 AND c.client_id = $2 ${locking}`, [campaignId, clientId])).rows[0] as Campaign | undefined
  if (!campaign) refuse('Campaign not available for this client', 'not_found')
  const lists = (await db.query(`SELECT l.id, l.name, l.client_id FROM campaign_lists cl
    JOIN email_lists l ON l.id = cl.list_id AND l.archived_at IS NULL
    WHERE cl.campaign_id = $1 ORDER BY l.id`, [campaignId])).rows as ListRow[]
  // Never act on a campaign whose audience reaches another client's (or an agency-wide) list.
  if (lists.some(list => list.client_id !== clientId)) refuse('Campaign targets lists outside this client', 'forbidden')
  return { campaign, listIds: lists.map(list => list.id), lists }
}

/** Optimistic-concurrency token for draft edits and proposals. */
function draftRevision(c: Campaign, listIds: string[]): string {
  return sha256({
    status: c.status, name: c.name, subject: c.subject, from_name: c.from_name, from_email: c.from_email, reply_to: c.reply_to,
    preview_text: c.preview_text, body_source: c.body_source ?? null, template_id: c.template_id, filter_rules: c.filter_rules ?? null, listIds
  })
}

async function freezeOf(db: LedgerDb, c: Campaign, listIds: string[]): Promise<Freeze> {
  const recipients = (await db.query(`SELECT COUNT(*)::int AS n,
      encode(sha256(convert_to(COALESCE(string_agg(subscriber_id::text || ':' || lower(email::text), ',' ORDER BY subscriber_id), ''), 'UTF8')), 'hex') AS h
    FROM campaign_recipients WHERE campaign_id = $1`, [c.id])).rows[0] as { n: number, h: string }
  const { senderDomainFromEmail } = await import('~~/server/utils/email-marketing/campaignSend')
  return {
    campaignId: c.id,
    clientId: String(c.client_id),
    contentHash: sha256({ subject: c.subject, from_name: c.from_name, from_email: c.from_email, reply_to: c.reply_to, preview_text: c.preview_text, body_html: c.body_html ?? '' }),
    audienceHash: sha256({ listIds, segment: c.filter_rules ?? null }),
    recipientsHash: recipients.h,
    recipientCount: Number(recipients.n),
    fromEmail: c.from_email,
    senderDomain: senderDomainFromEmail(c.from_email),
    provider: 'resend'
  }
}

function textExcerpt(html: string | null, max = 3000): string {
  return (html ?? '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

async function lockProposal(db: LedgerDb, proposalId: string, clientId: string, lock = true): Promise<ProposalRow> {
  const row = (await db.query(`SELECT id, user_id, status, expires_at, resolved_payload, result_payload FROM ai_pending_actions
    WHERE id = $1 AND source = 'mcp' AND tool_name = $2 ${lock ? 'FOR UPDATE' : ''}`, [proposalId, EMAIL_SEND_PROPOSAL_ACTION])).rows[0] as ProposalRow | undefined
  if (!row || row.resolved_payload?.clientId !== clientId) refuse('Send proposal not available for this client', 'not_found')
  return row
}
const proposalView = (row: ProposalRow, stale?: boolean) => ({
  proposalId: row.id, requesterId: row.user_id, campaignId: row.resolved_payload.campaignId, status: row.status,
  freezeRevision: row.resolved_payload.freezeRevision, freeze: row.resolved_payload.freeze, review: row.resolved_payload.review,
  execution: row.resolved_payload.execution, expiresAt: row.expires_at, result: row.result_payload,
  ...(stale === undefined ? {} : { stale })
})
const expired = (row: ProposalRow) => Date.parse(String(row.expires_at)) <= Date.now()

function preflightRefusal(preflight: { checks: Array<{ code: string, status: string, message: string }> }): never {
  throw Object.assign(new Error('preflight blocked'), {
    departmentResult: fail('Send preflight is blocked', 'preflight_blocked', { checks: preflight.checks.filter(check => check.status === 'blocked') })
  })
}

// --------------------------------------------------------------------------------------- reads

async function listCampaigns(args: Args<'marketing_list_email_campaigns'>) {
  const params: unknown[] = [args.clientId]
  const where = ['c.client_id = $1']
  if (args.status) {
    params.push(args.status)
    where.push(`c.status = $${params.length}`)
  }
  if (args.afterId) {
    params.push(args.afterId)
    where.push(`c.id > $${params.length}::uuid`)
  }
  params.push(args.limit + 1)
  const rows = await queryRowsFresh<Record<string, unknown> & { id: string }>(`SELECT c.id, c.name, c.subject, c.status, c.from_name, c.from_email,
      c.scheduled_at, c.started_at, c.finished_at, c.to_send, c.sent, c.delivered, c.opened, c.clicked, c.bounced, c.complained,
      c.unsubscribed, c.updated_at
    FROM campaigns c JOIN agency_clients ac ON ac.id = c.client_id AND ac.is_active = TRUE
    WHERE ${where.join(' AND ')} ORDER BY c.id LIMIT $${params.length}`, params)
  const items = rows.slice(0, args.limit)
  return ok({ clientId: args.clientId, items, nextCursor: rows.length > args.limit ? items.at(-1)!.id : null, complete: rows.length <= args.limit, storedOnly: true })
}

async function getCampaign(args: Args<'marketing_get_email_campaign'>, ctx: ToolContext, deps: DepartmentEmailDeps) {
  const { campaign, listIds, lists } = await campaignState(freshDb, args.campaignId, args.clientId, null)
  const [counts, recipients, proposals] = await Promise.all([
    queryRowsFresh<{ list_id: string, mailable: number }>(`SELECT sl.list_id, COUNT(*)::int AS mailable FROM subscriber_lists sl
      JOIN email_subscribers s ON s.id = sl.subscriber_id
      WHERE sl.list_id = ANY($1::uuid[]) AND sl.status <> 'unsubscribed' AND s.status = 'enabled'
        AND NOT EXISTS (SELECT 1 FROM suppression_list sup WHERE sup.email = s.email)
      GROUP BY sl.list_id`, [listIds]),
    queryRowsFresh<{ status: string, n: number }>(`SELECT status, COUNT(*)::int AS n FROM campaign_recipients WHERE campaign_id = $1 GROUP BY status`, [campaign.id]),
    queryRowsFresh<ProposalRow>(`SELECT id, user_id, status, expires_at, resolved_payload, result_payload FROM ai_pending_actions
      WHERE source = 'mcp' AND tool_name = $1 AND resolved_payload->>'campaignId' = $2 AND resolved_payload->>'clientId' = $3
      ORDER BY created_at DESC LIMIT 10`, [EMAIL_SEND_PROPOSAL_ACTION, campaign.id, args.clientId])
  ])
  const bodySourceBytes = Buffer.byteLength(JSON.stringify(campaign.body_source ?? null))
  const preflight = await preflightFor(campaign, Number(campaign.to_send ?? 0), ctx.event, deps)
  return ok({
    campaignId: campaign.id, clientId: args.clientId, name: campaign.name, status: campaign.status,
    subject: campaign.subject, fromName: campaign.from_name, fromEmail: campaign.from_email, replyTo: campaign.reply_to,
    previewText: campaign.preview_text, templateId: campaign.template_id, segment: campaign.filter_rules ?? null,
    lists: lists.map(list => ({ id: list.id, name: list.name, mailableCount: counts.find(c => c.list_id === list.id)?.mailable ?? 0 })),
    counters: {
      toSend: campaign.to_send, sent: campaign.sent, delivered: campaign.delivered, opened: campaign.opened, clicked: campaign.clicked,
      bounced: campaign.bounced, complained: campaign.complained, unsubscribed: campaign.unsubscribed
    },
    recipientQueue: Object.fromEntries(recipients.map(r => [r.status, r.n])),
    bodySource: bodySourceBytes <= MAX_BODY_SOURCE_READ_BYTES ? campaign.body_source ?? null : null,
    bodySourceOmitted: bodySourceBytes > MAX_BODY_SOURCE_READ_BYTES,
    bodyHtmlBytes: Buffer.byteLength(campaign.body_html ?? ''),
    textExcerpt: textExcerpt(campaign.body_html),
    preflight,
    sendingEnabled: await sendingEnabled(deps, ctx.event),
    revision: draftRevision(campaign, listIds),
    proposals: proposals.map(row => proposalView(row)),
    scheduledAt: campaign.scheduled_at, startedAt: campaign.started_at, finishedAt: campaign.finished_at, updatedAt: campaign.updated_at,
    note: 'Edits require this revision. Sending is proposal → independent review → execution.'
  })
}

async function listAudiences(args: Args<'marketing_list_email_audiences'>) {
  const [lists, templates] = await Promise.all([
    queryRowsFresh<Record<string, unknown>>(`SELECT l.id, l.name, l.description, l.double_optin, l.created_at,
        (SELECT COUNT(*)::int FROM subscriber_lists sl JOIN email_subscribers s ON s.id = sl.subscriber_id
          WHERE sl.list_id = l.id AND sl.status <> 'unsubscribed' AND s.status = 'enabled'
            AND NOT EXISTS (SELECT 1 FROM suppression_list sup WHERE sup.email = s.email)) AS mailable_count
      FROM email_lists l JOIN agency_clients ac ON ac.id = l.client_id AND ac.is_active = TRUE
      WHERE l.client_id = $1 AND l.archived_at IS NULL ORDER BY l.name, l.id LIMIT 101`, [args.clientId]),
    queryRowsFresh<Record<string, unknown>>(`SELECT t.id, t.name, t.subject, t.template_kind, t.folder_name, t.updated_at
      FROM edm_templates t JOIN agency_clients ac ON ac.id = t.client_id AND ac.is_active = TRUE
      WHERE t.client_id = $1 ORDER BY t.updated_at DESC, t.id LIMIT 101`, [args.clientId])
  ])
  return ok({
    clientId: args.clientId,
    lists: lists.slice(0, 100), listsComplete: lists.length <= 100,
    templates: templates.slice(0, 100), templatesComplete: templates.length <= 100,
    note: 'Counts exclude unsubscribed, suppressed, blocklisted and disabled subscribers. Subscriber addresses are never returned.'
  })
}

async function getProposal(args: Args<'marketing_get_email_send_proposal'>) {
  const row = await lockProposal(freshDb, args.proposalId, args.clientId, false)
  let stale = true
  try {
    const { campaign, listIds } = await campaignState(freshDb, row.resolved_payload.campaignId, args.clientId, null)
    stale = sha256(await freezeOf(freshDb, campaign, listIds)) !== row.resolved_payload.freezeRevision
  } catch (error) {
    if (!refusalOf(error)) throw error
  }
  return ok(proposalView(row, stale))
}

// -------------------------------------------------------------------------- local mutations

type Local = (db: LedgerDb, fresh: ToolContext) => Promise<Record<string, unknown>>

async function local(name: DepartmentEmailToolName, args: { clientId: string }, ctx: ToolContext, key: string, digest: string, work: Local): Promise<ToolResult> {
  const fresh = await authorize(ctx, args.clientId, true)
  const identity: ExecutionIdentity = {
    actorId: fresh.userId, key, digest, tool: name, clientId: args.clientId, inputHash: sha256({ name, args }), executor: 'local-transactional'
  }
  return transactionWithoutRetry(async (pool) => {
    const db = pool as unknown as LedgerDb
    const claim = await claimExecution(db, identity)
    if (claim.kind !== 'fresh') return claimOutcome(claim)
    const result = await work(db, fresh)
    await finishExecution(db, identity, result)
    return ok({ ...result, committed: true })
  })
}

async function validSegment(segment: unknown) {
  if (segment == null) return
  const { isValidSegment } = await import('~~/server/utils/email-marketing/segment')
  if (!isValidSegment(segment)) refuse('Invalid segment rules', 'bad_args')
}
async function validBody(source: unknown) {
  if (source === undefined) return
  const { isFlyhubFormat } = await import('../../../../shared/emailRendering/format')
  if (!isFlyhubFormat(source)) refuse('Body must be an Email Studio document', 'bad_args')
}

function createDraft(args: Args<'marketing_create_email_campaign_draft'>, deps: DepartmentEmailDeps): Local {
  return async (db, fresh) => {
    let source: unknown = args.bodySource
    let subject = args.subject
    let previewText = args.previewText
    if (args.templateId) {
      const template = (await db.query(`SELECT body_source, subject, preview_text FROM edm_templates WHERE id = $1 AND client_id = $2`,
        [args.templateId, args.clientId])).rows[0] as { body_source: unknown, subject: string | null, preview_text: string | null } | undefined
      if (!template) refuse('Template not available for this client', 'not_found')
      source = template.body_source ?? undefined
      subject = subject === undefined ? template.subject : subject
      previewText = previewText === undefined ? template.preview_text : previewText
    }
    await validBody(source)
    await validSegment(args.segment)
    const { createCampaign } = await import('~~/server/utils/email-marketing/campaigns')
    const campaign = await createCampaign({
      name: args.name, subject, from_name: args.fromName, from_email: args.fromEmail, reply_to: args.replyTo, preview_text: previewText,
      body_source: source, template_id: args.templateId ?? null, client_id: args.clientId, filter_rules: args.segment ?? null, created_by: fresh.userId
    }, await rendererFor(fresh, deps), db)
    return { campaignId: campaign.id, status: campaign.status, revision: draftRevision(campaign, []) }
  }
}

function updateDraft(args: Args<'marketing_update_email_campaign_draft'>, deps: DepartmentEmailDeps): Local {
  return async (db, fresh) => {
    const { campaign, listIds } = await campaignState(db, args.campaignId, args.clientId, 'update')
    if (campaign.status !== 'draft') refuse('Only draft campaigns can be edited', 'conflict')
    if (draftRevision(campaign, listIds) !== args.expectedRevision) refuse('Campaign changed since it was read; reload before applying', 'conflict')
    const p = args.patch
    await validBody(p.bodySource)
    await validSegment(p.segment)
    const { updateCampaign } = await import('~~/server/utils/email-marketing/campaigns')
    const updated = await updateCampaign(campaign.id, {
      name: p.name, subject: p.subject, from_name: p.fromName, from_email: p.fromEmail, reply_to: p.replyTo,
      preview_text: p.previewText, body_source: p.bodySource, filter_rules: p.segment
    }, await rendererFor(fresh, deps), db)
    if (!updated) refuse('Campaign not available for this client', 'not_found')
    return { campaignId: updated.id, status: updated.status, revision: draftRevision(updated, listIds) }
  }
}

function setAudience(args: Args<'marketing_set_email_campaign_audience'>): Local {
  return async (db) => {
    const { campaign, listIds } = await campaignState(db, args.campaignId, args.clientId, 'update')
    if (campaign.status !== 'draft') refuse('Only draft campaigns can change audience', 'conflict')
    if (draftRevision(campaign, listIds) !== args.expectedRevision) refuse('Campaign changed since it was read; reload before applying', 'conflict')
    const owned = (await db.query(`SELECT id FROM email_lists WHERE id = ANY($1::uuid[]) AND client_id = $2 AND archived_at IS NULL`,
      [args.listIds, args.clientId])).rows
    if (owned.length !== args.listIds.length) refuse('Every list must be an active list owned by this client', 'not_found')
    const { setCampaignLists } = await import('~~/server/utils/email-marketing/campaigns')
    await setCampaignLists(campaign.id, args.listIds, db)
    const next = [...args.listIds].sort()
    return { campaignId: campaign.id, listIds: next, revision: draftRevision(campaign, next) }
  }
}

function pauseSend(args: Args<'marketing_pause_email_campaign_send'>): Local {
  return async (db) => {
    const { campaign } = await campaignState(db, args.campaignId, args.clientId, 'update')
    if (campaign.status !== 'sending') refuse('Only a sending campaign can be paused', 'conflict')
    await db.query(`UPDATE campaigns SET status = 'paused', updated_at = NOW() WHERE id = $1 AND status = 'sending'`, [campaign.id])
    return { campaignId: campaign.id, status: 'paused', previousStatus: 'sending' }
  }
}

function cancelCampaign(args: Args<'marketing_cancel_email_campaign'>): Local {
  return async (db) => {
    const { campaign } = await campaignState(db, args.campaignId, args.clientId, 'update')
    if (campaign.status !== args.expectedStatus) refuse('Campaign status changed since it was read', 'conflict')
    const { canTransition } = await import('~~/server/utils/email-marketing/campaignSend')
    if (!canTransition(campaign.status, 'cancelled')) refuse(`A ${campaign.status} campaign cannot be cancelled`, 'conflict')
    await db.query(`UPDATE campaigns SET status = 'cancelled', finished_at = NOW(), updated_at = NOW() WHERE id = $1`, [campaign.id])
    const cancelled = (await db.query(`UPDATE campaign_recipients SET status = 'cancelled', claimed_at = NULL
      WHERE campaign_id = $1 AND status = 'pending' RETURNING id`, [campaign.id])).rows.length
    await db.query(`UPDATE ai_pending_actions SET status = 'cancelled' WHERE source = 'mcp' AND tool_name = $1
      AND resolved_payload->>'campaignId' = $2 AND status IN ('proposed', 'sending')`, [EMAIL_SEND_PROPOSAL_ACTION, campaign.id])
    return { campaignId: campaign.id, status: 'cancelled', previousStatus: campaign.status, cancelledRecipients: cancelled }
  }
}

async function proposeSend(args: Args<'marketing_propose_email_campaign_send'>, ctx: ToolContext, key: string, digest: string, deps: DepartmentEmailDeps): Promise<ToolResult> {
  const fresh = await authorize(ctx, args.clientId, true)
  const prior = await queryOneFresh(`SELECT 1 FROM god_mode_execution_ledger WHERE actor_user_id = $1 AND channel = 'mcp' AND idempotency_key = $2`,
    [fresh.userId, key])
  if (!prior) {
    // Pre-check before rebuilding the recipient queue; the claim transaction re-checks everything under lock.
    const { campaign, listIds } = await campaignState(freshDb, args.campaignId, args.clientId, null)
    if (campaign.status !== 'draft') refuse('Only draft campaigns can be proposed for sending', 'conflict')
    if (!listIds.length) refuse('Select at least one of the client\'s lists first', 'bad_args')
    if (draftRevision(campaign, listIds) !== args.expectedRevision) refuse('Campaign changed since it was read; reload before applying', 'conflict')
    const { getAppUrl } = await import('~~/server/utils/appUrl')
    // The application's own consent-aware materialization (dedup, unsubscribes, suppression, blocklist, segment).
    const materialize = deps.materialize ?? (await import('~~/server/utils/email-marketing/campaigns')).materializeRecipients
    await materialize(campaign.id, { appUrl: getAppUrl(fresh.event), userId: fresh.userId })
  }
  return local('marketing_propose_email_campaign_send', args, fresh, key, digest, async (db, actor) => {
    const { campaign, listIds } = await campaignState(db, args.campaignId, args.clientId, 'update')
    if (campaign.status !== 'draft') refuse('Only draft campaigns can be proposed for sending', 'conflict')
    if (!listIds.length) refuse('Select at least one of the client\'s lists first', 'bad_args')
    if (draftRevision(campaign, listIds) !== args.expectedRevision) refuse('Campaign changed since it was read; reload before applying', 'conflict')
    const freeze = await freezeOf(db, campaign, listIds)
    const preflight = await preflightFor(campaign, freeze.recipientCount, actor.event, deps)
    if (preflight.blocked) preflightRefusal(preflight)
    const { canEnterSending } = await import('~~/server/utils/email-marketing/campaignSend')
    const gate = canEnterSending({ status: campaign.status, toSend: freeze.recipientCount, bodyHtml: campaign.body_html })
    if (!gate.ok) refuse(gate.reason ?? 'Campaign cannot be sent', 'conflict')
    const freezeRevision = sha256(freeze)
    const payload: ProposalPayload = {
      kind: EMAIL_SEND_PROPOSAL_ACTION, clientId: args.clientId, campaignId: campaign.id, freeze, freezeRevision, requestKey: key, review: null, execution: null
    }
    const row = (await db.query(`INSERT INTO ai_pending_actions (user_id, tool_name, resolved_payload, status, source, conversation_id, client_scope, expires_at)
      VALUES ($1, $2, $3::jsonb, 'proposed', 'mcp', NULL, $4, NOW() + MAKE_INTERVAL(hours => $5)) RETURNING id, expires_at`,
    [actor.userId, EMAIL_SEND_PROPOSAL_ACTION, JSON.stringify(payload), args.clientId, PROPOSAL_TTL_HOURS])).rows[0] as { id: string, expires_at: string }
    return {
      proposalId: row.id, campaignId: campaign.id, status: 'proposed', freezeRevision, recipientCount: freeze.recipientCount,
      expiresAt: row.expires_at, sent: false, next: 'An independent admin or marketing manager must review this proposal'
    }
  })
}

function reviewSend(args: Args<'marketing_review_email_campaign_send'>, deps: DepartmentEmailDeps): Local {
  return async (db, fresh) => {
    const proposal = await lockProposal(db, args.proposalId, args.clientId)
    const payload = proposal.resolved_payload
    if (proposal.status !== 'proposed' || payload.review) refuse('Proposal is not awaiting review', 'conflict')
    if (expired(proposal)) refuse('Proposal expired; prepare a new one', 'conflict')
    if (payload.freezeRevision !== args.expectedFreezeRevision) refuse('Proposal revision does not match what you read', 'conflict')
    if (proposal.user_id.toLowerCase() === fresh.userId.toLowerCase()) refuse('Requesters cannot review their own send proposal', 'forbidden')
    await (deps.requireReviewer ?? defaultRequireReviewer)(fresh.event, { requesterId: proposal.user_id, clientId: args.clientId, reviewerId: fresh.userId })
    await (deps.assertRequester ?? defaultAssertRequester)(fresh.event, proposal.user_id, args.clientId)
    const { campaign, listIds } = await campaignState(db, payload.campaignId, args.clientId, 'share')
    if (campaign.status !== 'draft' || sha256(await freezeOf(db, campaign, listIds)) !== payload.freezeRevision) {
      refuse('Campaign content, audience or recipients changed since the proposal; prepare a new proposal', 'conflict')
    }
    payload.review = { reviewerId: fresh.userId, decision: args.decision, reason: args.reason, freezeRevision: payload.freezeRevision, reviewedAt: new Date().toISOString() }
    const status = args.decision === 'approve' ? 'proposed' : 'rejected'
    await db.query(`UPDATE ai_pending_actions SET resolved_payload = $2::jsonb, confirmed_by = $3, status = $4 WHERE id = $1`,
      [proposal.id, JSON.stringify(payload), fresh.userId, status])
    return { proposalId: proposal.id, campaignId: payload.campaignId, decision: args.decision, status, freezeRevision: payload.freezeRevision, sent: false }
  }
}

// ----------------------------------------------------------------------- provider mutations

async function executeSend(args: Args<'marketing_execute_email_campaign_send'>, ctx: ToolContext, key: string, digest: string, deps: DepartmentEmailDeps): Promise<ToolResult> {
  let fresh = await authorize(ctx, args.clientId, true)
  const name = 'marketing_execute_email_campaign_send'
  const identity: ExecutionIdentity = { actorId: fresh.userId, key, digest, tool: name, clientId: args.clientId, inputHash: sha256({ name, args }), executor: 'external-provider' }
  const start = await transactionWithoutRetry(async (pool) => {
    const db = pool as unknown as LedgerDb
    const claim = await claimExecution(db, identity)
    if (claim.kind !== 'fresh') return { outcome: claimOutcome(claim) }
    // Hard send gate (request-bound send switch + Resend key), checked before anything is changed.
    if (!await sendingEnabled(deps, fresh.event)) refuse('Email sending is disabled for this environment', 'sending_disabled')
    const proposal = await lockProposal(db, args.proposalId, args.clientId)
    const payload = proposal.resolved_payload
    if (payload.freezeRevision !== args.expectedFreezeRevision) refuse('Proposal revision does not match what you read', 'conflict')
    const review = payload.review
    if (!review || review.decision !== 'approve' || review.freezeRevision !== payload.freezeRevision) refuse('An independent approval of this exact proposal is required', 'forbidden')
    const actor = fresh.userId.toLowerCase()
    if (actor !== proposal.user_id.toLowerCase() && actor !== review.reviewerId.toLowerCase()) refuse('Only the requester or reviewer may send this proposal', 'forbidden')
    const first = proposal.status === 'proposed'
    if (!first && proposal.status !== 'sending') refuse(`Proposal is ${proposal.status}`, 'conflict')
    if (first && expired(proposal)) refuse('Approval expired; prepare a new proposal', 'conflict')
    await (deps.assertRequester ?? defaultAssertRequester)(fresh.event, proposal.user_id, args.clientId)
    await (deps.requireReviewer ?? defaultRequireReviewer)(fresh.event, { requesterId: proposal.user_id, clientId: args.clientId, reviewerId: review.reviewerId })
    const { campaign, listIds } = await campaignState(db, payload.campaignId, args.clientId, 'update')
    if (!(first ? ['draft'] : ['sending', 'paused']).includes(campaign.status)) refuse(`Campaign is ${campaign.status}`, 'conflict')
    const freeze = await freezeOf(db, campaign, listIds)
    if (sha256(freeze) !== payload.freezeRevision) refuse('Campaign content, audience or recipients changed since approval; prepare a new proposal', 'conflict')
    const preflight = await preflightFor(campaign, freeze.recipientCount, fresh.event, deps)
    if (preflight.blocked) preflightRefusal(preflight)
    if (first) {
      const { canEnterSending } = await import('~~/server/utils/email-marketing/campaignSend')
      const gate = canEnterSending({ status: campaign.status, toSend: freeze.recipientCount, bodyHtml: campaign.body_html })
      if (!gate.ok) refuse(gate.reason ?? 'Campaign cannot be sent', 'conflict')
    }
    if (campaign.status !== 'sending') {
      await db.query(`UPDATE campaigns SET status = 'sending', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
        WHERE id = $1 AND status = $2`, [campaign.id, campaign.status])
    }
    payload.execution = {
      startedBy: payload.execution?.startedBy ?? fresh.userId,
      startedAt: payload.execution?.startedAt ?? new Date().toISOString(),
      runs: (payload.execution?.runs ?? 0) + 1,
      lastRunKey: key
    }
    await db.query(`UPDATE ai_pending_actions SET status = 'sending', resolved_payload = $2::jsonb WHERE id = $1`, [proposal.id, JSON.stringify(payload)])
    return { campaign: { ...campaign, status: 'sending' as const }, proposalId: proposal.id, requesterId: proposal.user_id, reviewerId: review.reviewerId }
  })
  if ('outcome' in start) return start.outcome as ToolResult

  const { campaign, proposalId, requesterId, reviewerId } = start
  let dispatched = false
  const close = (state: 'succeeded' | 'failed' | 'ambiguous', result: Record<string, unknown>) =>
    transactionWithoutRetry(async pool => finishExecution(pool as unknown as LedgerDb, identity, result, state))
  const hold = async (proposalStatus: string | null) => {
    await transactionWithoutRetry(async (pool) => {
      await pool.query(`UPDATE campaigns SET status = 'paused', updated_at = NOW() WHERE id = $1 AND status = 'sending'`, [campaign.id])
      if (proposalStatus) await pool.query(`UPDATE ai_pending_actions SET status = $2 WHERE id = $1`, [proposalId, proposalStatus])
    }).catch(() => undefined)
  }
  try {
    // Re-check actor, requester and reviewer revocation immediately before provider I/O.
    fresh = await authorize(fresh, args.clientId, true)
    await (deps.assertRequester ?? defaultAssertRequester)(fresh.event, requesterId, args.clientId)
    await (deps.requireReviewer ?? defaultRequireReviewer)(fresh.event, { requesterId, clientId: args.clientId, reviewerId })
    dispatched = true
    const runSend = deps.runSend ?? (await import('~~/server/utils/email-marketing/campaignSender')).runCampaignSend
    const run = await runSend(campaign, { prepareHtml: false, maxChunks: MAX_CHUNKS_PER_CALL, event: fresh.event })
    let status = 'sending'
    const summary = { sent: run.sent, failed: run.failed, remaining: run.remaining, drained: run.drained, rateLimited: run.rateLimited, retryAfterSec: run.retryAfterSec }
    if (run.drained) {
      await transactionWithoutRetry(async (pool) => {
        await pool.query(`UPDATE campaigns SET status = 'sent', finished_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'sending'`, [campaign.id])
        await pool.query(`UPDATE ai_pending_actions SET status = 'executed', executed_at = NOW(), result_payload = $2::jsonb WHERE id = $1`,
          [proposalId, JSON.stringify({ campaignId: campaign.id, status: 'sent' })])
      })
      status = 'sent'
    }
    const result = {
      proposalId, campaignId: campaign.id, status, ...summary,
      providerMessageIds: 'recorded per recipient in campaign_recipients.resend_message_id and email_events',
      ...(run.drained ? {} : { next: 'Call again with a new request to continue sending the remaining frozen recipients' })
    }
    try {
      await close('succeeded', result)
    } catch {
      return ok({ ...result, ledgerRecorded: false, note: 'Sent, but the execution record could not be finalised; do not retry this request.' })
    }
    return ok(result)
  } catch {
    if (!dispatched) {
      await hold(null)
      await close('failed', { proposalId, campaignId: campaign.id, error: 'authority_revoked_before_send' }).catch(() => undefined)
      return fail('Authority changed before sending; the campaign was paused and nothing was sent by this request', 'forbidden')
    }
    // Some batches may have reached Resend. Per-recipient state is authoritative; claimed-but-unconfirmed
    // recipients stay claimed, so nothing is re-sent automatically.
    await hold('reconciliation_required')
    await close('ambiguous', { proposalId, campaignId: campaign.id, reconciliationRequired: true }).catch(() => undefined)
    return fail('Send outcome requires reconciliation; the campaign was paused. Check recipient states before any retry', 'reconciliation_required')
  }
}

async function sendTest(args: Args<'marketing_send_email_campaign_test'>, ctx: ToolContext, key: string, digest: string, deps: DepartmentEmailDeps): Promise<ToolResult> {
  let fresh = await authorize(ctx, args.clientId, true)
  const name = 'marketing_send_email_campaign_test'
  const identity: ExecutionIdentity = { actorId: fresh.userId, key, digest, tool: name, clientId: args.clientId, inputHash: sha256({ name, args }), executor: 'external-provider' }
  const prepared = await transactionWithoutRetry(async (pool) => {
    const db = pool as unknown as LedgerDb
    const claim = await claimExecution(db, identity)
    if (claim.kind !== 'fresh') return { outcome: claimOutcome(claim) }
    if (!await sendingEnabled(deps, fresh.event)) refuse('Email sending is disabled for this environment', 'sending_disabled')
    const { campaign, listIds } = await campaignState(db, args.campaignId, args.clientId, 'share')
    if (draftRevision(campaign, listIds) !== args.expectedRevision) refuse('Campaign changed since it was read; reload before testing', 'conflict')
    const member = (await db.query(`SELECT email, name FROM team_members WHERE id = $1 AND is_active = TRUE`, [fresh.userId])).rows[0] as { email: string | null, name: string | null } | undefined
    if (!member?.email) refuse('No verified staff email address for this account', 'forbidden')
    if (fresh.userEmail && fresh.userEmail.toLowerCase() !== member.email.toLowerCase()) refuse('Signed-in identity does not match the staff email address', 'forbidden')
    return { campaign, to: member.email, name: member.name }
  })
  if ('outcome' in prepared) return prepared.outcome as ToolResult
  let dispatched = false
  const close = (state: 'succeeded' | 'failed' | 'ambiguous', result: Record<string, unknown>) =>
    transactionWithoutRetry(async pool => finishExecution(pool as unknown as LedgerDb, identity, result, state))
  try {
    fresh = await authorize(fresh, args.clientId, true)
    const send = deps.sendTest ?? (await import('~~/server/utils/email-marketing/campaignTestSend')).sendCampaignTestEmail
    const sent = await send(fresh.event, {
      campaign: prepared.campaign, to: prepared.to, name: prepared.name, userId: fresh.userId,
      onDispatchStart: () => {
        dispatched = true
      }
    })
    const result = { campaignId: args.campaignId, sentTo: sent.sentTo, providerMessageId: sent.providerMessageId, test: true }
    await close('succeeded', result).catch(() => undefined)
    return ok(result)
  } catch (error) {
    const statusMessage = (error as { statusMessage?: string })?.statusMessage
    // A Resend error response is a definitive rejection; anything else after dispatch may have been delivered.
    if (dispatched && statusMessage !== 'test_send_failed') {
      await close('ambiguous', { campaignId: args.campaignId, reconciliationRequired: true }).catch(() => undefined)
      return fail('Test send outcome is unknown; check your inbox before trying again', 'reconciliation_required')
    }
    await close('failed', { campaignId: args.campaignId, error: String(statusMessage ?? 'test_send_failed').slice(0, 200) }).catch(() => undefined)
    if (statusMessage === 'campaign_preflight_blocked') return fail('Send preflight is blocked', 'preflight_blocked')
    return refusalOf(error) ?? fail('Test email could not be sent', statusMessage === 'resend_unavailable' ? 'unavailable' : 'failed')
  }
}

// ---------------------------------------------------------------------------------- dispatch

export async function runDepartmentEmailOperation(
  name: string, raw: unknown, ctx: ToolContext, key?: string, digest?: string, deps: DepartmentEmailDeps = {}
): Promise<ToolResult> {
  const contract = departmentEmailContracts[name as DepartmentEmailToolName]
  if (!contract) return fail('Unknown department email operation', 'not_found')
  const parsed = contract.safeParse(raw)
  if (!parsed.success) return fail('Invalid department email arguments', 'bad_args')
  const args = parsed.data as { clientId: string }
  try {
    if (WRITES.has(name)) {
      if (!validExecutionIdentity(key, digest)) return fail('Verified logical request identity required', 'coordinator_required')
      const k = key, d = digest!
      switch (name as DepartmentEmailToolName) {
        case 'marketing_propose_email_campaign_send': return await proposeSend(args as Args<'marketing_propose_email_campaign_send'>, ctx, k, d, deps)
        case 'marketing_execute_email_campaign_send': return await executeSend(args as Args<'marketing_execute_email_campaign_send'>, ctx, k, d, deps)
        case 'marketing_send_email_campaign_test': return await sendTest(args as Args<'marketing_send_email_campaign_test'>, ctx, k, d, deps)
        case 'marketing_create_email_campaign_draft': return await local(name as DepartmentEmailToolName, args, ctx, k, d, createDraft(args as Args<'marketing_create_email_campaign_draft'>, deps))
        case 'marketing_update_email_campaign_draft': return await local(name as DepartmentEmailToolName, args, ctx, k, d, updateDraft(args as Args<'marketing_update_email_campaign_draft'>, deps))
        case 'marketing_set_email_campaign_audience': return await local(name as DepartmentEmailToolName, args, ctx, k, d, setAudience(args as Args<'marketing_set_email_campaign_audience'>))
        case 'marketing_review_email_campaign_send': return await local(name as DepartmentEmailToolName, args, ctx, k, d, reviewSend(args as Args<'marketing_review_email_campaign_send'>, deps))
        case 'marketing_pause_email_campaign_send': return await local(name as DepartmentEmailToolName, args, ctx, k, d, pauseSend(args as Args<'marketing_pause_email_campaign_send'>))
        default: return await local(name as DepartmentEmailToolName, args, ctx, k, d, cancelCampaign(args as Args<'marketing_cancel_email_campaign'>))
      }
    }
    await authorize(ctx, args.clientId, false)
    if (name === 'marketing_list_email_campaigns') return await listCampaigns(args as Args<'marketing_list_email_campaigns'>)
    if (name === 'marketing_get_email_campaign') return await getCampaign(args as Args<'marketing_get_email_campaign'>, ctx, deps)
    if (name === 'marketing_list_email_audiences') return await listAudiences(args as Args<'marketing_list_email_audiences'>)
    return await getProposal(args as Args<'marketing_get_email_send_proposal'>)
  } catch (error) {
    const refusal = refusalOf(error)
    if (refusal) return refusal
    const status = (error as { statusCode?: number })?.statusCode
    if (status === 403) return fail('Not permitted for this marketing email request', 'forbidden')
    if (status === 404) return fail('Client or campaign not available', 'not_found')
    if (status === 400 || status === 413 || status === 422) return fail('The application rejected this email request', 'bad_args')
    if (status === 409) return fail('Campaign state does not allow this change', 'conflict')
    return fail('Department email operation unavailable', 'unavailable')
  }
}
