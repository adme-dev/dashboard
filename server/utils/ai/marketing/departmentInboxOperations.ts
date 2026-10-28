/**
 * Marketing department social inbox (community management) over MCP. Uses the application's own
 * conversations, internal notes, triage fields, native response queue and shared reply dispatcher —
 * no second inbox or delivery pipeline. Every call re-resolves fresh MARKETING_MANAGEMENT + department
 * grant and the active client; conversations must belong to that client through an active connected
 * account of the same client.
 *
 * Replies are drafted into social_response_queue (staff / pending). Sending is a separate call by an
 * independent admin or marketing manager who did not draft it, binding the exact queue item, content
 * hash, conversation, connected account and reply target. The ai_pending_actions freeze record is
 * approval evidence only. The send claims the ledger and the queue row ('sending') durably before the
 * provider call; an outcome that may have reached the platform is held (no blind retry), and the
 * platform message id is stored where the dispatcher records outbound messages.
 */
import type { z } from 'zod'
import type { H3Event } from 'h3'
import { execute, queryOne, queryRowsFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { requireMarketingDepartment } from './departmentAuthority'
import { resolveMarketingReadScope, requireScopedClient } from './readScope'
import { escapeLike, fail, ok, type ToolContext, type ToolResult } from '../toolContext'
import {
  departmentInboxContracts, DEPARTMENT_INBOX_WRITE_NAMES, INBOX_REPLY_FREEZE_ACTION, type DepartmentInboxToolName
} from './departmentInboxSchemas'
import {
  claimExecution, claimOutcome, finishExecution, refuse, refusalOf, sha256, validExecutionIdentity,
  type ExecutionIdentity, type LedgerDb
} from './departmentExecutionLedger'

type Args<N extends DepartmentInboxToolName> = z.infer<(typeof departmentInboxContracts)[N]>
type Effect = () => Promise<unknown> | unknown
const WRITES = new Set<string>(DEPARTMENT_INBOX_WRITE_NAMES)
const FREEZE_TTL_DAYS = 7

type DispatchResult = { ok: boolean, platformMessageId?: string, error?: string, dispatched?: boolean }
export interface DepartmentInboxDeps {
  replyCapable?: (platform: string) => boolean
  dispatch?: (conversationId: string, args: { content: string, sentByUserId: string, aiGenerated?: boolean, expectedTarget: string, onDispatchStart: () => void }) => Promise<DispatchResult>
  requireReviewer?: (event: H3Event, input: { requesterId: string, clientId: string, reviewerId: string }) => Promise<unknown>
  assertRequester?: (event: H3Event, requesterId: string, clientId: string) => Promise<void>
  emit?: (params: { clientId: string, type: string, conversationId?: string, actorId?: string }, event?: H3Event) => unknown
  notifyMentions?: (input: { conversationId: string, content: string, authorId: string, mentionUserIds: unknown }) => Promise<void>
}

interface ConversationRow {
  id: string
  client_id: string
  social_account_id: string
  platform: string
  channel_type: string
  platform_conversation_id: string
  status: string
  assigned_to: string | null
  priority: string | null
  tags: string[] | null
  platform_account_id: string
  account_name: string | null
}
interface QueueRow {
  id: string
  client_id: string
  conversation_id: string
  message_id: string | null
  rule_id: string | null
  draft_content: string
  status: string
  approver_type: string
}
interface FreezePayload {
  kind: typeof INBOX_REPLY_FREEZE_ACTION
  clientId: string
  conversationId: string
  queueItemId: string
  socialAccountId: string
  platformAccountId: string
  platform: string
  channelType: string
  inboundMessageId: string
  replyTargetId: string
  contentHash: string
}
interface FreezeRow { id: string, user_id: string, status: string, resolved_payload: FreezePayload }

// ---------------------------------------------------------------------------------- authority

async function authorize(ctx: ToolContext, clientId: string, write: boolean): Promise<ToolContext> {
  const fresh = await requireMarketingDepartment(ctx, write)
  await requireScopedClient(await resolveMarketingReadScope(fresh), clientId)
  return fresh
}
async function defaultAssertRequester(event: H3Event, requesterId: string, clientId: string): Promise<void> {
  const { assertMarketingCapabilityAtBoundary } = await import('./reviewAuthority')
  const requester = await assertMarketingCapabilityAtBoundary(event, requesterId, clientId, 'department_management')
  if (!requester.permissionGroups?.includes('MARKETING_MANAGEMENT')) refuse('Drafter no longer has department authority', 'forbidden')
}
async function defaultRequireReviewer(event: H3Event, input: { requesterId: string, clientId: string, reviewerId: string }) {
  const { requireIndependentMarketingReviewer } = await import('./reviewAuthority')
  return requireIndependentMarketingReviewer(event, input)
}
async function replyCapable(platform: string, deps: DepartmentInboxDeps): Promise<boolean> {
  if (deps.replyCapable) return deps.replyCapable(platform)
  const { getProviderOrThrow } = await import('~~/server/utils/social-providers/registry')
  try {
    return typeof getProviderOrThrow(platform).reply === 'function'
  } catch {
    return false
  }
}
async function emit(deps: DepartmentInboxDeps, params: { clientId: string, type: string, conversationId?: string, actorId?: string }, event: H3Event) {
  const fn = deps.emit ?? (await import('~~/server/utils/socialInbox/events')).emitInboxEvent
  fn(params, event)
}

// -------------------------------------------------------------------------- conversation state

const freshDb: LedgerDb = { query: async (sql, params) => ({ rows: await queryRowsFresh(sql, params as unknown[]) }) }
const targetDb = (db: LedgerDb) => ({
  queryOne: async <T>(sql: string, params?: unknown[]) => ((await db.query(sql, params)).rows[0] as T | undefined) ?? null
})
const approvalDb = (db: LedgerDb) => ({
  ...targetDb(db),
  execute: async (sql: string, params?: unknown[]) => (await db.query(sql, params)).rows.length
})

/** Conversation of an active client, through an active connected account of the same client. */
async function conversationState(db: LedgerDb, conversationId: string, clientId: string, lock: 'update' | 'share' | null): Promise<ConversationRow> {
  const locking = lock === 'update' ? 'FOR UPDATE OF c' : lock === 'share' ? 'FOR SHARE OF c' : ''
  const row = (await db.query(`SELECT c.id, c.client_id, c.social_account_id, c.platform, c.channel_type, c.platform_conversation_id,
      c.status, c.assigned_to, c.priority, c.tags, a.platform_account_id, a.account_name
    FROM social_conversations c
    JOIN social_accounts a ON a.id = c.social_account_id AND a.is_active = TRUE AND a.client_id = c.client_id
    JOIN agency_clients ac ON ac.id = c.client_id AND ac.is_active = TRUE
    WHERE c.id = $1 AND c.client_id = $2 ${locking}`, [conversationId, clientId])).rows[0] as ConversationRow | undefined
  if (!row) refuse('Conversation not available for this client', 'not_found')
  return row
}
async function latestInbound(db: LedgerDb, conversationId: string): Promise<{ id: string } | undefined> {
  return (await db.query(`SELECT id FROM social_messages WHERE conversation_id = $1 AND direction = 'in' AND is_internal_note = FALSE
    ORDER BY platform_timestamp DESC NULLS LAST, created_at DESC LIMIT 1`, [conversationId])).rows[0]
}
async function replyTarget(db: LedgerDb, conversation: ConversationRow): Promise<string> {
  const { resolveReplyTarget } = await import('~~/server/utils/socialInbox/dispatch')
  return resolveReplyTarget(targetDb(db), conversation.id, conversation)
}
const contentHash = (content: string) => sha256(content)
const sendableQueue = (row: Pick<QueueRow, 'status' | 'approver_type'>) =>
  (row.approver_type === 'staff' && row.status === 'pending')
  || (row.approver_type === 'client' && row.status === 'approved')
  || (row.approver_type === 'none' && row.status === 'approved')

// --------------------------------------------------------------------------------------- reads

async function listConversations(args: Args<'marketing_list_inbox_conversations'>) {
  const params: unknown[] = [args.clientId]
  const where = ['c.client_id = $1']
  const add = (sql: string, value: unknown) => {
    params.push(value)
    where.push(sql.replace('?', `$${params.length}`))
  }
  if (args.status) add('c.status = ?', args.status)
  if (args.channel) add('c.channel_type = ?', args.channel)
  if (args.platform) add('c.platform = ?', args.platform)
  if (args.assignedTo) add('c.assigned_to = ?', args.assignedTo)
  if (args.unassigned) where.push('c.assigned_to IS NULL')
  if (args.breached) where.push('c.sla_breached = TRUE')
  if (args.search) {
    params.push(`%${escapeLike(args.search)}%`)
    const i = params.length
    where.push(`(c.participant_name ILIKE $${i} ESCAPE '\\' OR c.participant_handle ILIKE $${i} ESCAPE '\\' OR c.last_message_preview ILIKE $${i} ESCAPE '\\')`)
  }
  params.push(args.limit + 1, args.offset)
  const rows = await queryRowsFresh<Record<string, unknown>>(`SELECT c.id, c.platform, c.channel_type, c.status, c.priority, c.assigned_to,
      c.participant_name, c.participant_handle, c.last_message_at, LEFT(c.last_message_preview, 300) AS last_message_preview,
      c.last_message_direction, c.unread_count, c.message_count, c.sentiment, c.rating, c.tags, c.sla_due_at, c.sla_breached,
      c.snoozed_until, c.permalink, c.social_account_id, a.account_name, c.updated_at
    FROM social_conversations c
    JOIN social_accounts a ON a.id = c.social_account_id AND a.is_active = TRUE AND a.client_id = c.client_id
    JOIN agency_clients ac ON ac.id = c.client_id AND ac.is_active = TRUE
    WHERE ${where.join(' AND ')}
    ORDER BY c.last_message_at DESC NULLS LAST, c.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params)
  const items = rows.slice(0, args.limit)
  return ok({
    clientId: args.clientId, items, complete: rows.length <= args.limit,
    nextOffset: rows.length > args.limit ? args.offset + args.limit : null, untrustedContent: true
  })
}

async function getConversation(args: Args<'marketing_get_inbox_conversation'>, deps: DepartmentInboxDeps) {
  const conversation = await conversationState(freshDb, args.conversationId, args.clientId, null)
  const [messages, queue, inbound, target, detail] = await Promise.all([
    queryRowsFresh<Record<string, unknown>>(`SELECT id, direction, author_name, message_type, LEFT(content, 4000) AS content, is_internal_note,
        sent_by_user_id, ai_generated, platform_message_id, parent_message_id, platform_timestamp, created_at
      FROM social_messages WHERE conversation_id = $1 AND client_id = $2
      ORDER BY platform_timestamp DESC NULLS LAST, created_at DESC LIMIT $3`, [conversation.id, args.clientId, args.messageLimit]),
    queueItems(args.clientId, { conversationId: conversation.id, limit: 20 }),
    latestInbound(freshDb, conversation.id),
    replyTarget(freshDb, conversation),
    queryRowsFresh<Record<string, unknown>>(`SELECT participant_name, participant_handle, permalink, snoozed_until, sla_due_at, sla_breached,
        unread_count, message_count, sentiment, rating, last_message_at, updated_at FROM social_conversations WHERE id = $1`, [conversation.id])
  ])
  return ok({
    conversationId: conversation.id, clientId: args.clientId, platform: conversation.platform, channelType: conversation.channel_type,
    status: conversation.status, assignedTo: conversation.assigned_to, priority: conversation.priority, tags: conversation.tags ?? [],
    ...detail[0],
    account: { socialAccountId: conversation.social_account_id, platformAccountId: conversation.platform_account_id, name: conversation.account_name },
    latestInboundMessageId: inbound?.id ?? null,
    replyTargetId: target,
    replySupported: await replyCapable(conversation.platform, deps),
    messages: messages.reverse(),
    replyQueue: queue,
    untrustedContent: true,
    note: 'Use status/assignedTo as triage expectations, latestInboundMessageId to draft, and the queue item contentHash, socialAccountId and replyTargetId to send.'
  })
}

async function queueItems(clientId: string, opts: { conversationId?: string, status?: string, limit: number }) {
  const params: unknown[] = [clientId, INBOX_REPLY_FREEZE_ACTION]
  const where = ['rq.client_id = $1']
  if (opts.conversationId) {
    params.push(opts.conversationId)
    where.push(`rq.conversation_id = $${params.length}`)
  }
  if (opts.status === 'actionable') {
    where.push(`((rq.approver_type = 'staff' AND rq.status = 'pending') OR (rq.approver_type = 'client' AND rq.status = 'approved') OR (rq.approver_type = 'none' AND rq.status = 'approved'))`)
  } else if (opts.status) {
    params.push(opts.status)
    where.push(`rq.status = $${params.length}`)
  }
  params.push(opts.limit)
  const rows = await queryRowsFresh<Record<string, unknown> & { draft_content: string }>(`SELECT rq.id, rq.conversation_id, rq.message_id, rq.rule_id,
      rq.draft_content, rq.status, rq.approver_type, rq.effective_mode, rq.confidence, rq.approved_by, rq.approved_at, rq.error,
      rq.created_at, rq.updated_at, c.platform, c.channel_type, c.social_account_id, f.user_id AS drafted_by,
      f.resolved_payload->>'replyTargetId' AS reviewed_reply_target_id
    FROM social_response_queue rq
    JOIN social_conversations c ON c.id = rq.conversation_id AND c.client_id = rq.client_id
    JOIN social_accounts a ON a.id = c.social_account_id AND a.is_active = TRUE AND a.client_id = c.client_id
    JOIN agency_clients ac ON ac.id = rq.client_id AND ac.is_active = TRUE
    LEFT JOIN ai_pending_actions f ON f.source = 'mcp' AND f.tool_name = $2 AND f.resolved_payload->>'queueItemId' = rq.id::text
    WHERE ${where.join(' AND ')}
    ORDER BY rq.created_at DESC, rq.id LIMIT $${params.length}`, params)
  return rows.map(row => ({ ...row, contentHash: contentHash(row.draft_content), sendable: sendableQueue(row as unknown as QueueRow) }))
}

async function listQueue(args: Args<'marketing_list_inbox_reply_queue'>) {
  const items = await queueItems(args.clientId, { status: args.status, limit: args.limit })
  return ok({ clientId: args.clientId, items, untrustedContent: true, note: 'Read the conversation for its current replyTargetId before sending.' })
}

// -------------------------------------------------------------------------- local mutations

interface Work { result: Record<string, unknown>, effects: Effect[] }

async function local(name: DepartmentInboxToolName, args: { clientId: string }, ctx: ToolContext, key: string, digest: string,
  work: (db: LedgerDb, fresh: ToolContext) => Promise<Work>): Promise<ToolResult> {
  const fresh = await authorize(ctx, args.clientId, true)
  const identity: ExecutionIdentity = {
    actorId: fresh.userId, key, digest, tool: name, clientId: args.clientId, inputHash: sha256({ name, args }), executor: 'local-transactional'
  }
  let effects: Effect[] = []
  const outcome = await transactionWithoutRetry(async (pool) => {
    const db = pool as unknown as LedgerDb
    const claim = await claimExecution(db, identity)
    if (claim.kind !== 'fresh') return claimOutcome(claim)
    const done = await work(db, fresh)
    await finishExecution(db, identity, done.result)
    effects = done.effects
    return ok({ ...done.result, committed: true })
  })
  // Only a fresh commit fans out; replays and refusals never repeat events or notifications.
  if (outcome.ok && !(outcome.data as { replayed?: boolean }).replayed) {
    for (const effect of effects) {
      try {
        await effect()
      } catch (error) {
        console.error('[department-inbox] post-commit effect failed:', (error as Error)?.message)
      }
    }
  }
  return outcome
}

function triage(args: Args<'marketing_triage_inbox_conversation'>, deps: DepartmentInboxDeps) {
  return async (db: LedgerDb, fresh: ToolContext): Promise<Work> => {
    const conversation = await conversationState(db, args.conversationId, args.clientId, 'update')
    if (conversation.status !== args.expected.status || (conversation.assigned_to ?? null) !== (args.expected.assignedTo ?? null)) {
      refuse('Conversation was triaged since it was read; reload before applying', 'conflict')
    }
    const p = args.patch
    if (p.assignedTo) {
      const member = (await db.query(`SELECT id FROM team_members WHERE id = $1 AND is_active = TRUE`, [p.assignedTo])).rows[0]
      if (!member) refuse('Assignee must be an active team member', 'bad_args')
    }
    if (p.snoozedUntil && Date.parse(p.snoozedUntil) <= Date.now()) refuse('snoozedUntil must be in the future', 'bad_args')
    const { buildConversationPatchUpdate } = await import('~~/server/utils/socialInbox/conversationPatch')
    const update = buildConversationPatchUpdate({
      status: p.status,
      ...(p.assignedTo !== undefined ? { assigned_to: p.assignedTo } : {}),
      ...(p.snoozedUntil !== undefined ? { snoozed_until: p.snoozedUntil } : {}),
      ...(p.priority !== undefined ? { priority: p.priority } : {}),
      ...(p.tags !== undefined ? { tags: p.tags } : {}),
      markRead: p.markRead
    })
    if (!update.sets.length) refuse('Nothing to update', 'bad_args')
    update.params.push(conversation.id)
    await db.query(`UPDATE social_conversations SET ${update.sets.join(', ')}, updated_at = NOW() WHERE id = $${update.params.length}`, update.params)
    const after = (await db.query(`SELECT status, assigned_to, priority, tags, snoozed_until FROM social_conversations WHERE id = $1`, [conversation.id])).rows[0]
    return {
      result: { conversationId: conversation.id, status: after.status, assignedTo: after.assigned_to, priority: after.priority, tags: after.tags ?? [], snoozedUntil: after.snoozed_until },
      effects: update.broadcastWorthy
        ? [() => emit(deps, { clientId: args.clientId, type: 'conversation.changed', conversationId: conversation.id, actorId: fresh.userId }, fresh.event)]
        : []
    }
  }
}

function addNote(args: Args<'marketing_add_inbox_note'>, deps: DepartmentInboxDeps) {
  return async (db: LedgerDb, fresh: ToolContext): Promise<Work> => {
    const conversation = await conversationState(db, args.conversationId, args.clientId, 'share')
    const mentions = [...new Set(args.mentionUserIds)]
    if (mentions.length) {
      const found = (await db.query(`SELECT id FROM team_members WHERE id = ANY($1::uuid[]) AND is_active = TRUE`, [mentions])).rows
      if (found.length !== mentions.length) refuse('Mentions must be active team members', 'bad_args')
    }
    const { insertInternalNote } = await import('~~/server/utils/socialInbox/notes')
    const noteId = await insertInternalNote(db, { conversationId: conversation.id, clientId: args.clientId, content: args.content, authorId: fresh.userId })
    return {
      result: { conversationId: conversation.id, noteId, mentioned: mentions.length, sentToPlatform: false },
      effects: [async () => {
        const notify = deps.notifyMentions ?? (await import('~~/server/utils/socialInbox/notes')).notifyNoteMentions
        await notify({ conversationId: conversation.id, content: args.content, authorId: fresh.userId, mentionUserIds: mentions })
      }]
    }
  }
}

function draftReply(args: Args<'marketing_draft_inbox_reply'>, deps: DepartmentInboxDeps) {
  return async (db: LedgerDb, fresh: ToolContext): Promise<Work> => {
    const conversation = await conversationState(db, args.conversationId, args.clientId, 'update')
    const inbound = await latestInbound(db, conversation.id)
    if (!inbound || inbound.id !== args.expectedLatestInboundMessageId) refuse('A newer inbound message arrived; reload before drafting', 'conflict')
    if (!await replyCapable(conversation.platform, deps)) refuse(`${conversation.platform} replies are not supported`, 'unsupported')
    const target = await replyTarget(db, conversation)
    const queued = (await db.query(`INSERT INTO social_response_queue
        (client_id, conversation_id, message_id, draft_content, status, effective_mode, approver_type, guardrail_notes)
      VALUES ($1, $2, $3, $4, 'pending', 'approval', 'staff', $5)
      ON CONFLICT (message_id) WHERE message_id IS NOT NULL DO NOTHING RETURNING id`,
    [args.clientId, conversation.id, inbound.id, args.content, 'Drafted through the marketing assistant; an independent reviewer must send it.'])).rows[0] as { id: string } | undefined
    if (!queued) refuse('A reply draft already exists for this message; review or reject it first', 'conflict')
    const hash = contentHash(args.content)
    const payload: FreezePayload = {
      kind: INBOX_REPLY_FREEZE_ACTION, clientId: args.clientId, conversationId: conversation.id, queueItemId: queued.id,
      socialAccountId: conversation.social_account_id, platformAccountId: conversation.platform_account_id, platform: conversation.platform,
      channelType: conversation.channel_type, inboundMessageId: inbound.id, replyTargetId: target, contentHash: hash
    }
    await db.query(`INSERT INTO ai_pending_actions (user_id, tool_name, resolved_payload, status, source, conversation_id, client_scope, expires_at)
      VALUES ($1, $2, $3::jsonb, 'proposed', 'mcp', NULL, $4, NOW() + MAKE_INTERVAL(days => $5))`,
    [fresh.userId, INBOX_REPLY_FREEZE_ACTION, JSON.stringify(payload), args.clientId, FREEZE_TTL_DAYS])
    const { recordSocialInboxApprovalEvent } = await import('~~/server/utils/socialInbox/clientApprovals')
    await recordSocialInboxApprovalEvent(approvalDb(db), {
      conversationId: conversation.id, clientId: args.clientId, actorId: fresh.userId, eventType: 'staff_reply_drafted',
      content: 'Staff drafted a reply; an independent reviewer must send it.', metadata: { response_queue_id: queued.id, channel: 'mcp' }
    })
    return {
      result: { queueItemId: queued.id, conversationId: conversation.id, socialAccountId: conversation.social_account_id, replyTargetId: target, contentHash: hash, status: 'pending', sent: false },
      effects: [() => emit(deps, { clientId: args.clientId, type: 'conversation.changed', conversationId: conversation.id, actorId: fresh.userId }, fresh.event)]
    }
  }
}

function rejectReply(args: Args<'marketing_reject_inbox_reply'>, deps: DepartmentInboxDeps) {
  return async (db: LedgerDb, fresh: ToolContext): Promise<Work> => {
    const row = (await db.query(`SELECT rq.id, rq.conversation_id, rq.status, rq.approver_type FROM social_response_queue rq
      JOIN agency_clients ac ON ac.id = rq.client_id AND ac.is_active = TRUE
      WHERE rq.id = $1 AND rq.client_id = $2 FOR UPDATE OF rq`, [args.queueItemId, args.clientId])).rows[0] as QueueRow | undefined
    if (!row) refuse('Reply draft not available for this client', 'not_found')
    if (row.status !== 'pending' || row.approver_type !== 'staff') refuse(`Cannot reject a ${row.status} ${row.approver_type} item`, 'conflict')
    await db.query(`UPDATE social_response_queue SET status = 'rejected', approved_by = $2, approved_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND approver_type = 'staff' AND status = 'pending'`, [row.id, fresh.userId])
    await db.query(`UPDATE social_conversations SET automation_state = NULL, updated_at = NOW() WHERE id = $1`, [row.conversation_id])
    await db.query(`UPDATE ai_pending_actions SET status = 'rejected' WHERE source = 'mcp' AND tool_name = $1 AND resolved_payload->>'queueItemId' = $2`,
      [INBOX_REPLY_FREEZE_ACTION, row.id])
    const { recordSocialInboxApprovalEvent } = await import('~~/server/utils/socialInbox/clientApprovals')
    await recordSocialInboxApprovalEvent(approvalDb(db), {
      conversationId: row.conversation_id, clientId: args.clientId, actorId: fresh.userId, eventType: 'staff_approval_rejected',
      content: 'Staff rejected the reply draft.', metadata: { response_queue_id: row.id, reason: args.reason, channel: 'mcp' }
    })
    return {
      result: { queueItemId: row.id, conversationId: row.conversation_id, status: 'rejected', sent: false },
      effects: [() => emit(deps, { clientId: args.clientId, type: 'conversation.changed', conversationId: row.conversation_id, actorId: fresh.userId }, fresh.event)]
    }
  }
}

// ----------------------------------------------------------------------- provider mutation

async function sendReply(args: Args<'marketing_send_inbox_reply'>, ctx: ToolContext, key: string, digest: string, deps: DepartmentInboxDeps): Promise<ToolResult> {
  let fresh = await authorize(ctx, args.clientId, true)
  const name = 'marketing_send_inbox_reply'
  const identity: ExecutionIdentity = { actorId: fresh.userId, key, digest, tool: name, clientId: args.clientId, inputHash: sha256({ name, args }), executor: 'external-provider' }
  const start = await transactionWithoutRetry(async (pool) => {
    const db = pool as unknown as LedgerDb
    const claim = await claimExecution(db, identity)
    if (claim.kind !== 'fresh') return { outcome: claimOutcome(claim) }
    const queue = (await db.query(`SELECT id, client_id, conversation_id, message_id, rule_id, draft_content, status, approver_type
      FROM social_response_queue WHERE id = $1 AND client_id = $2 FOR UPDATE`, [args.queueItemId, args.clientId])).rows[0] as QueueRow | undefined
    if (!queue) refuse('Reply not available for this client', 'not_found')
    if (!sendableQueue(queue)) refuse(`Cannot send a ${queue.status} ${queue.approver_type} item`, 'conflict')
    if (queue.conversation_id !== args.conversationId) refuse('Reply belongs to a different conversation', 'conflict')
    // Browser edits change draft_content, so a reviewed hash never authorizes different text.
    if (contentHash(queue.draft_content) !== args.expectedContentHash) refuse('Reply content changed since it was reviewed', 'conflict')
    const conversation = await conversationState(db, args.conversationId, args.clientId, 'update')
    if (conversation.social_account_id !== args.socialAccountId) refuse('Connected account changed since review', 'conflict')
    if (!await replyCapable(conversation.platform, deps)) refuse(`${conversation.platform} replies are not supported`, 'unsupported')
    if (await replyTarget(db, conversation) !== args.replyTargetId) refuse('Reply target changed since review (a newer message arrived)', 'conflict')

    const freeze = (await db.query(`SELECT id, user_id, status, resolved_payload FROM ai_pending_actions
      WHERE source = 'mcp' AND tool_name = $1 AND resolved_payload->>'queueItemId' = $2 FOR UPDATE`, [INBOX_REPLY_FREEZE_ACTION, queue.id])).rows[0] as FreezeRow | undefined
    let requesterId: string | null = null
    if (freeze) {
      const f = freeze.resolved_payload
      if (freeze.status !== 'proposed') refuse(`Reply draft is ${freeze.status}`, 'conflict')
      if (f.clientId !== args.clientId || f.conversationId !== conversation.id || f.contentHash !== args.expectedContentHash
        || f.socialAccountId !== conversation.social_account_id || f.platformAccountId !== conversation.platform_account_id
        || f.replyTargetId !== args.replyTargetId) {
        refuse('Reply no longer matches the drafted conversation, account, target or content', 'conflict')
      }
      requesterId = freeze.user_id
      if (requesterId.toLowerCase() === fresh.userId.toLowerCase()) refuse('The drafter cannot send their own reply; an independent reviewer must send it', 'forbidden')
      await (deps.assertRequester ?? defaultAssertRequester)(fresh.event, requesterId, args.clientId)
    } else if (queue.approver_type === 'staff' && queue.rule_id) {
      requesterId = `automation:${queue.rule_id}`
    } else if (queue.approver_type === 'client') {
      requesterId = 'client-approval'
    } else {
      refuse('Unattributed reply drafts cannot be sent through the assistant; use the inbox', 'forbidden')
    }
    await (deps.requireReviewer ?? defaultRequireReviewer)(fresh.event, { requesterId: requesterId!, clientId: args.clientId, reviewerId: fresh.userId })
    await db.query(`UPDATE social_response_queue SET status = 'sending', updated_at = NOW() WHERE id = $1 AND status = $2`, [queue.id, queue.status])
    if (freeze) await db.query(`UPDATE ai_pending_actions SET status = 'sending', confirmed_by = $2 WHERE id = $1`, [freeze.id, fresh.userId])
    return { queue, conversation, freezeId: freeze?.id ?? null, requesterId: requesterId!, drafterId: freeze?.user_id ?? null }
  })
  if ('outcome' in start) return start.outcome as ToolResult

  const { queue, conversation, freezeId, requesterId, drafterId } = start
  let dispatched = false
  const settle = async (queueStatus: string, error: string | null, freezeStatus: string | null, ledger: 'succeeded' | 'failed' | 'ambiguous', result: Record<string, unknown>, sent?: string) => {
    await transactionWithoutRetry(async (pool) => {
      const db = pool as unknown as LedgerDb
      await db.query(`UPDATE social_response_queue SET status = $2, error = $3, updated_at = NOW()
        ${sent ? ', approved_by = $4, approved_at = NOW()' : ''} WHERE id = $1 AND status = 'sending'`,
      sent ? [queue.id, queueStatus, error, sent] : [queue.id, queueStatus, error])
      if (freezeId && freezeStatus) {
        await db.query(`UPDATE ai_pending_actions SET status = $2, executed_at = CASE WHEN $2 = 'executed' THEN NOW() ELSE executed_at END,
          result_payload = $3::jsonb WHERE id = $1`, [freezeId, freezeStatus, JSON.stringify(result)])
      }
      if (sent) {
        await db.query(`UPDATE social_conversations SET automation_state = NULL, updated_at = NOW() WHERE id = $1`, [conversation.id])
        const { recordSocialInboxApprovalEvent } = await import('~~/server/utils/socialInbox/clientApprovals')
        await recordSocialInboxApprovalEvent(approvalDb(db), {
          conversationId: conversation.id, clientId: args.clientId, actorId: sent, eventType: 'approval_reply_sent',
          content: 'An independent reviewer approved and sent the reply.', metadata: { response_queue_id: queue.id, approver_type: queue.approver_type, channel: 'mcp' }
        })
      }
      await finishExecution(db, identity, result, ledger)
    })
  }
  const base = { queueItemId: queue.id, conversationId: conversation.id }
  try {
    // Re-check sender (independent reviewer) and drafter revocation immediately before provider I/O.
    fresh = await authorize(fresh, args.clientId, true)
    await (deps.requireReviewer ?? defaultRequireReviewer)(fresh.event, { requesterId, clientId: args.clientId, reviewerId: fresh.userId })
    if (drafterId) await (deps.assertRequester ?? defaultAssertRequester)(fresh.event, drafterId, args.clientId)
    const dispatch = deps.dispatch ?? (async (conversationId: string, input: Parameters<NonNullable<DepartmentInboxDeps['dispatch']>>[1]) => {
      const { dispatchReply } = await import('~~/server/utils/socialInbox/dispatch')
      return dispatchReply({ queryOne, execute }, conversationId, input)
    })
    const res = await dispatch(conversation.id, {
      content: queue.draft_content, sentByUserId: fresh.userId, aiGenerated: !!queue.rule_id,
      expectedTarget: args.replyTargetId, onDispatchStart: () => { dispatched = true }
    })
    if (res.ok) {
      const result = { ...base, status: 'sent', platformMessageId: res.platformMessageId ?? null }
      try {
        await settle('sent', null, 'executed', 'succeeded', result, fresh.userId)
      } catch {
        return ok({ ...result, ledgerRecorded: false, note: 'Sent, but the queue/execution record could not be finalised; do not retry.' })
      }
      await emit(deps, { clientId: args.clientId, type: 'message.added', conversationId: conversation.id, actorId: fresh.userId }, fresh.event).catch(() => undefined)
      return ok(result)
    }
    if (!dispatched && !res.dispatched) {
      await settle(queue.status, null, 'proposed', 'failed', { ...base, error: String(res.error ?? 'reply_not_started').slice(0, 200) }).catch(() => undefined)
      return fail(res.error === 'reply_target_changed' ? 'Reply target changed since review; nothing was sent' : 'Reply could not be started; nothing was sent', res.error === 'reply_target_changed' ? 'conflict' : 'failed')
    }
    // The provider was called and did not confirm; it may still have posted. Hold for reconciliation.
    await settle('failed', `reconciliation_required: ${String(res.error ?? 'unconfirmed').slice(0, 200)}`, 'reconciliation_required', 'ambiguous', { ...base, reconciliationRequired: true }).catch(() => undefined)
    return fail('Reply outcome is unconfirmed; check the platform thread before drafting again', 'reconciliation_required')
  } catch {
    if (!dispatched) {
      await settle(queue.status, null, 'proposed', 'failed', { ...base, error: 'authority_or_dispatch_unavailable' }).catch(() => undefined)
      return fail('Authority changed or the dispatcher was unavailable; nothing was sent', 'forbidden')
    }
    await settle('failed', 'reconciliation_required: dispatch interrupted', 'reconciliation_required', 'ambiguous', { ...base, reconciliationRequired: true }).catch(() => undefined)
    return fail('Reply outcome is unconfirmed; check the platform thread before drafting again', 'reconciliation_required')
  }
}

// ---------------------------------------------------------------------------------- dispatch

export async function runDepartmentInboxOperation(
  name: string, raw: unknown, ctx: ToolContext, key?: string, digest?: string, deps: DepartmentInboxDeps = {}
): Promise<ToolResult> {
  const contract = departmentInboxContracts[name as DepartmentInboxToolName]
  if (!contract) return fail('Unknown department inbox operation', 'not_found')
  const parsed = contract.safeParse(raw)
  if (!parsed.success) return fail('Invalid department inbox arguments', 'bad_args')
  const args = parsed.data as { clientId: string }
  try {
    if (WRITES.has(name)) {
      if (!validExecutionIdentity(key, digest)) return fail('Verified logical request identity required', 'coordinator_required')
      const n = name as DepartmentInboxToolName, k = key, d = digest!
      if (n === 'marketing_send_inbox_reply') return await sendReply(args as Args<typeof n>, ctx, k, d, deps)
      const work = n === 'marketing_triage_inbox_conversation'
        ? triage(args as Args<'marketing_triage_inbox_conversation'>, deps)
        : n === 'marketing_add_inbox_note'
          ? addNote(args as Args<'marketing_add_inbox_note'>, deps)
          : n === 'marketing_draft_inbox_reply'
            ? draftReply(args as Args<'marketing_draft_inbox_reply'>, deps)
            : rejectReply(args as Args<'marketing_reject_inbox_reply'>, deps)
      return await local(n, args, ctx, k, d, work)
    }
    await authorize(ctx, args.clientId, false)
    if (name === 'marketing_list_inbox_conversations') return await listConversations(args as Args<'marketing_list_inbox_conversations'>)
    if (name === 'marketing_get_inbox_conversation') return await getConversation(args as Args<'marketing_get_inbox_conversation'>, deps)
    return await listQueue(args as Args<'marketing_list_inbox_reply_queue'>)
  } catch (error) {
    const refusal = refusalOf(error)
    if (refusal) return refusal
    const status = (error as { statusCode?: number })?.statusCode
    if (status === 403) return fail('Not permitted for this marketing inbox request', 'forbidden')
    if (status === 404) return fail('Client or conversation not available', 'not_found')
    return fail('Department inbox operation unavailable', 'unavailable')
  }
}
