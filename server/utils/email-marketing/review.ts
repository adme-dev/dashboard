// server/utils/email-marketing/review.ts
// M06 review workflow: per-block comments and draft → in_review → approved on
// saved template/campaign content. Approval binds the database-derived digest of
// the exact current content (migration 497); the campaigns trigger enforces it
// on every entrypoint. Commands are strict, CAS-checked and replayable through
// actor/operation receipts bound to domain, command, target and payload.
// No notifications, provider calls or sends happen here.

import { createError } from 'h3'
import { getCachedBinding } from '~~/server/utils/email'
import { getTransactionFailureStage, queryOneFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { outlineReviewBlocks, REVIEW_BLOCK_ID, REVIEW_LIMITS, type ReviewBlock } from '../../../shared/emailRendering/reviewBlocks'

export type ReviewTargetKind = 'template' | 'campaign'
export type ReviewStateName = 'draft' | 'in_review' | 'approved'
export type ReviewAuthority = 'read' | 'write' | 'review'
export const REVIEW_COMMANDS = ['comment', 'resolve_comment', 'submit', 'approve', 'request_changes', 'require_review'] as const
export type ReviewCommandName = typeof REVIEW_COMMANDS[number]

export interface ReviewDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}
export type ReviewTransaction = <T>(work: (db: ReviewDb) => Promise<T>) => Promise<T>
/** Fresh stored authority for the target's stored client; throws 401/403. */
export type ReviewAuthorizer = (authority: ReviewAuthority, clientId: string | null) => Promise<void>

export interface ReviewTarget {
  kind: ReviewTargetKind
  id: string
  clientId: string | null
  status: string | null
  reviewRequired: boolean
  digest: string
  revisionId: string | null
  bodySource: unknown
  /** Stored campaign HTML (null for templates); submit preparation starts from it. */
  bodyHtml: string | null
}

export interface ReviewStateRow {
  state: ReviewStateName
  content_digest: string | null
  version: number
  submitted_by: string | null
  submitted_at: string | null
  decided_by: string | null
  decided_at: string | null
  note: string | null
}

export type ReviewCommandPayload
  = | { command: 'comment', blockId: string | null, parentId: string | null, body: string }
    | { command: 'resolve_comment', commentId: string, resolved: boolean }
    | { command: 'submit' }
    | { command: 'approve' }
    | { command: 'request_changes', note: string }
    | { command: 'require_review' }

export interface ReviewCommandInput {
  actorId: string
  operationId: string
  kind: ReviewTargetKind
  targetId: string
  /** Client scope the actor saw; must equal the stored owner (cross-client guard). */
  expectedClientId: string | null
  expectedVersion: number
  expectedContentDigest: string
  payload: ReviewCommandPayload
}

export interface ReviewCommandResult {
  operationId: string
  command: ReviewCommandName
  targetKind: ReviewTargetKind
  targetId: string
  state: ReviewStateName
  version: number
  contentDigest: string
  commentId?: string
  reviewRequired?: boolean
  replayed?: boolean
}

const DIGEST = /^[a-f0-9]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const READABLE: Record<string, string> = {
  campaign_approval_required: 'Approve this exact campaign content and audience in Review before scheduling or sending.',
  review_independent_reviewer_required: 'Another reviewer must approve this version; you submitted it.',
  campaign_content_frozen: 'This campaign has left draft; its approved content is frozen.',
  campaign_review_permanent: 'Review cannot be switched off for this campaign.'
}

function fail(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage, message: READABLE[statusMessage] ?? statusMessage })
}

/** FIGFLOW_EDM_WORKFLOW_ENABLED gate. A request binding that is present wins
 * (including 'false'); then the per-request cached binding; then process.env. */
export function isEmailReviewWorkflowEnabled(env?: Record<string, unknown> | null): boolean {
  const fromRequest = env && Object.hasOwn(env, 'FIGFLOW_EDM_WORKFLOW_ENABLED') ? env.FIGFLOW_EDM_WORKFLOW_ENABLED : undefined
  const value = fromRequest ?? getCachedBinding('FIGFLOW_EDM_WORKFLOW_ENABLED') ?? process.env.FIGFLOW_EDM_WORKFLOW_ENABLED
  return value === 'true' || value === true
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.keys(value as Record<string, unknown>).sort()
    .filter(key => (value as Record<string, unknown>)[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
  return `{${entries.join(',')}}`
}

export async function reviewPayloadSha256(input: Omit<ReviewCommandInput, 'actorId' | 'operationId'>): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson({ domain: 'email_review', ...input }))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Campaign reviews bind the review digest: recipient-visible content plus the
 * audience identity (segment rules and target list IDs). Templates have no
 * audience and bind their content and canonical revision. */
const TARGET_SQL: Record<ReviewTargetKind, string> = {
  campaign: `SELECT c.id, c.client_id, c.status, c.review_required, c.body_source, c.body_html, NULL::uuid AS revision_id,
      email_campaign_review_digest_of(c) AS digest
    FROM campaigns c WHERE c.id = $1`,
  template: `SELECT t.id, t.client_id, NULL::text AS status, false AS review_required, t.body_source, NULL::text AS body_html,
      t.email_design_revision_id AS revision_id,
      email_template_content_digest(t.body_source, t.body_html, t.subject, t.preview_text, t.email_design_revision_id) AS digest
    FROM edm_templates t WHERE t.id = $1`
}

export async function loadReviewTarget(db: ReviewDb, kind: ReviewTargetKind, id: string, lock: boolean): Promise<ReviewTarget | null> {
  const row = (await db.query(`${TARGET_SQL[kind]}${lock ? ' FOR UPDATE' : ''}`, [id])).rows[0]
  if (!row) return null
  return {
    kind,
    id: row.id,
    clientId: row.client_id ?? null,
    status: row.status ?? null,
    reviewRequired: row.review_required === true,
    digest: row.digest,
    revisionId: row.revision_id ?? null,
    bodySource: row.body_source,
    bodyHtml: typeof row.body_html === 'string' ? row.body_html : null
  }
}

async function loadState(db: ReviewDb, kind: ReviewTargetKind, id: string, lock: boolean): Promise<ReviewStateRow> {
  const row = (await db.query(`SELECT state, content_digest, version, submitted_by, submitted_at::text, decided_by,
      decided_at::text, note FROM email_review_states WHERE target_kind = $1 AND target_id = $2${lock ? ' FOR UPDATE' : ''}`,
  [kind, id])).rows[0] as ReviewStateRow | undefined
  return row ?? {
    state: 'draft', content_digest: null, version: 0, submitted_by: null, submitted_at: null, decided_by: null, decided_at: null, note: null
  }
}

/** Approval is current only for the exact database-derived digest. */
export function approvalIsCurrent(state: Pick<ReviewStateRow, 'state' | 'content_digest'>, digest: string): boolean {
  return state.state === 'approved' && !!state.content_digest && state.content_digest === digest
}

function assertScope(target: ReviewTarget, expectedClientId: string | null): void {
  // Do not reveal another client's target: a mismatch looks like absence.
  if ((target.clientId ?? null) !== (expectedClientId ?? null)) fail(404, 'review_target_not_found')
}

/** With FIGFLOW_EDM_WORKFLOW_ENABLED off, only campaigns that are already gated
 * stay reviewable, so a rollback never strands them; everything else (templates,
 * ungated campaigns, new enrollment) looks absent. */
function assertWorkflowReachable(target: Pick<ReviewTarget, 'kind' | 'reviewRequired'>, workflowEnabled: boolean): void {
  if (!workflowEnabled && !(target.kind === 'campaign' && target.reviewRequired)) fail(404, 'review_target_not_found')
}

function sameActor(left: string | null | undefined, right: string): boolean {
  return !!left && left.toLowerCase() === right.toLowerCase()
}

function requireAuthority(command: ReviewCommandName): ReviewAuthority {
  return command === 'approve' || command === 'request_changes' ? 'review' : 'write'
}

function validateInput(input: ReviewCommandInput): void {
  if (!UUID.test(input.actorId) || !UUID.test(input.operationId) || !UUID.test(input.targetId)) fail(400, 'invalid_review_command')
  if (input.expectedClientId !== null && !UUID.test(input.expectedClientId)) fail(400, 'invalid_review_command')
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) fail(400, 'invalid_review_command')
  if (!DIGEST.test(input.expectedContentDigest)) fail(400, 'invalid_review_command')
  const p = input.payload
  if (p.command === 'comment') {
    const body = p.body.trim()
    if (!body || body.length > REVIEW_LIMITS.commentChars) fail(400, 'invalid_review_comment')
    if (p.blockId !== null && !REVIEW_BLOCK_ID.test(p.blockId)) fail(400, 'invalid_review_comment')
    if (p.parentId !== null && !UUID.test(p.parentId)) fail(400, 'invalid_review_comment')
  }
  if (p.command === 'resolve_comment' && !UUID.test(p.commentId)) fail(400, 'invalid_review_command')
  if (p.command === 'request_changes' && (!p.note.trim() || p.note.length > REVIEW_LIMITS.noteChars)) fail(400, 'invalid_review_note')
  if (p.command === 'require_review' && input.kind !== 'campaign') fail(400, 'invalid_review_command')
}

async function writeState(db: ReviewDb, target: ReviewTarget, current: ReviewStateRow, next: {
  state: ReviewStateName
  contentDigest: string | null
  submittedBy?: string
  decidedBy?: string
  note?: string | null
}): Promise<number> {
  const version = current.version + 1
  const params = [target.kind, target.id, target.clientId, next.state, next.contentDigest, version,
    next.submittedBy ?? null, next.decidedBy ?? null, next.note ?? null, current.version]
  // $7 restamps the submitter only on submit; $8 records the deciding reviewer.
  const rows = current.version === 0
    ? (await db.query(`INSERT INTO email_review_states (target_kind, target_id, client_id, state, content_digest, version,
        submitted_by, submitted_at, decided_by, decided_at, note)
        SELECT $1::text, $2::uuid, $3::uuid, $4::text, $5::text, $6::int,
          $7::uuid, CASE WHEN $7::uuid IS NULL THEN NULL ELSE now() END,
          $8::uuid, CASE WHEN $8::uuid IS NULL THEN NULL ELSE now() END, $9::text
        WHERE $10::int = 0
        ON CONFLICT (target_kind, target_id) DO NOTHING RETURNING version`, params)).rows
    : (await db.query(`UPDATE email_review_states SET client_id = $3::uuid, state = $4::text, content_digest = $5::text,
        version = $6::int,
        submitted_by = COALESCE($7::uuid, submitted_by),
        submitted_at = CASE WHEN $7::uuid IS NULL THEN submitted_at ELSE now() END,
        decided_by = $8::uuid, decided_at = CASE WHEN $8::uuid IS NULL THEN NULL ELSE now() END,
        note = $9::text, updated_at = now()
        WHERE target_kind = $1::text AND target_id = $2::uuid AND version = $10::int RETURNING version`, params)).rows
  if (!rows.length) fail(409, 'review_state_changed')
  return version
}

async function applyCommand(
  db: ReviewDb,
  input: ReviewCommandInput,
  locked: ReviewTarget,
  preparedHtml: string | null,
  workflowEnabled: boolean
): Promise<Omit<ReviewCommandResult, 'operationId'>> {
  let target = locked
  const state = await loadState(db, target.kind, target.id, true)
  if (state.version !== input.expectedVersion) fail(409, 'review_state_changed')
  // Every command binds what the actor saw; concurrent edits never get silently re-anchored.
  if (target.digest !== input.expectedContentDigest) fail(409, 'review_content_changed')
  const base = { command: input.payload.command, targetKind: target.kind, targetId: target.id, contentDigest: target.digest }
  const p = input.payload
  const editableCampaign = target.kind !== 'campaign' || target.status === 'draft'

  switch (p.command) {
    case 'comment': {
      if (p.blockId !== null && !outlineReviewBlocks(target.bodySource).some(block => block.id === p.blockId)) fail(422, 'review_block_not_found')
      if (p.parentId !== null) {
        const parent = (await db.query(`SELECT id FROM email_review_comments WHERE id = $1 AND target_kind = $2 AND target_id = $3
          AND parent_id IS NULL AND block_id IS NOT DISTINCT FROM $4`, [p.parentId, target.kind, target.id, p.blockId])).rows[0]
        if (!parent) fail(422, 'review_thread_not_found')
      }
      const row = (await db.query(`INSERT INTO email_review_comments (target_kind, target_id, client_id, block_id, content_digest,
          revision_id, parent_id, body, author_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [target.kind, target.id, target.clientId, p.blockId, target.digest, target.revisionId, p.parentId, p.body.trim(), input.actorId])).rows[0]
      return { ...base, state: state.state, version: state.version, commentId: row.id }
    }
    case 'resolve_comment': {
      const rows = (await db.query(`UPDATE email_review_comments
          SET resolved_at = CASE WHEN $4 THEN COALESCE(resolved_at, now()) ELSE NULL END,
              resolved_by = CASE WHEN $4 THEN COALESCE(resolved_by, $5::uuid) ELSE NULL END
          WHERE id = $1 AND target_kind = $2 AND target_id = $3 RETURNING id`,
      [p.commentId, target.kind, target.id, p.resolved, input.actorId])).rows
      if (!rows.length) fail(404, 'review_comment_not_found')
      return { ...base, state: state.state, version: state.version, commentId: p.commentId }
    }
    case 'submit': {
      if (!editableCampaign) fail(409, 'review_target_frozen')
      if (state.state !== 'draft') fail(409, 'review_not_draft')
      // Sendable HTML prepared outside the transaction (no lock held during asset
      // I/O) from exactly the content verified above; it is written here, in the
      // same transaction as the state and receipt, so an attempt that does not
      // commit leaves no side effect and the identical retry prepares again.
      if (preparedHtml !== null && target.kind === 'campaign' && preparedHtml !== target.bodyHtml) {
        const written = (await db.query('UPDATE campaigns SET body_html = $2, updated_at = now() WHERE id = $1 AND status = \'draft\' RETURNING id',
          [target.id, preparedHtml])).rows
        if (!written.length) fail(409, 'review_target_frozen')
        const reloaded = await loadReviewTarget(db, target.kind, target.id, true)
        if (!reloaded) fail(404, 'review_target_not_found')
        target = reloaded
      }
      const version = await writeState(db, target, state, { state: 'in_review', contentDigest: target.digest, submittedBy: input.actorId })
      return { ...base, contentDigest: target.digest, state: 'in_review', version }
    }
    case 'approve': {
      if (!editableCampaign) fail(409, 'review_target_frozen')
      if (state.state !== 'in_review' || state.content_digest !== target.digest) fail(409, 'review_not_in_review')
      // Independent approval: the submitter never approves their own version.
      if (!state.submitted_by || sameActor(state.submitted_by, input.actorId)) fail(403, 'review_independent_reviewer_required')
      const version = await writeState(db, target, state, { state: 'approved', contentDigest: target.digest, decidedBy: input.actorId })
      return { ...base, state: 'approved', version }
    }
    case 'request_changes': {
      if (!editableCampaign) fail(409, 'review_target_frozen')
      if (state.state === 'draft') fail(409, 'review_not_in_review')
      const version = await writeState(db, target, state, { state: 'draft', contentDigest: null, decidedBy: input.actorId, note: p.note.trim() })
      return { ...base, state: 'draft', version }
    }
    case 'require_review': {
      // New enrollment is a workflow feature; with the flag off it does not exist.
      if (!workflowEnabled) fail(404, 'review_target_not_found')
      if (target.status !== 'draft') fail(409, 'review_target_frozen')
      await db.query('UPDATE campaigns SET review_required = true, updated_at = now() WHERE id = $1 AND status = \'draft\'', [target.id])
      return { ...base, state: state.state, version: state.version, reviewRequired: true }
    }
  }
}

export interface ReviewServiceDeps {
  transaction?: ReviewTransaction
  readReceipt?: (actorId: string, operationId: string) => Promise<ReceiptRow | null>
  /** Fresh non-transactional reads used before submit preparation. */
  readDb?: ReviewDb
  /** Campaign submit only: return the sendable form of `target.bodyHtml` (asset
   * mirroring) WITHOUT writing it. The command transaction writes it before the
   * digest is bound, so later idempotent preparation at schedule or test-send
   * time cannot silently invalidate the approval. */
  prepareSubmission?: (target: ReviewTarget) => Promise<string>
  /** FIGFLOW_EDM_WORKFLOW_ENABLED for this request (defaults to enabled). */
  workflowEnabled?: boolean
}

const freshReadDb: ReviewDb = { query: async (sql, params) => ({ rows: [await queryOneFresh(sql, params)].filter(Boolean) }) }

/** Computes, but never writes, the sendable HTML for a fresh campaign submit.
 * Returns null when nothing should be prepared; the transaction re-verifies the
 * digest under lock, so the HTML always derives from the content it replaces. */
async function prepareBeforeSubmit(input: ReviewCommandInput, authorize: ReviewAuthorizer, deps: ReviewServiceDeps, workflowEnabled: boolean): Promise<string | null> {
  const db = deps.readDb ?? freshReadDb
  const target = await loadReviewTarget(db, input.kind, input.targetId, false)
  if (!target) fail(404, 'review_target_not_found')
  assertScope(target, input.expectedClientId)
  await authorize('write', target.clientId)
  assertWorkflowReachable(target, workflowEnabled)
  const state = await loadState(db, input.kind, input.targetId, false)
  if (state.version !== input.expectedVersion) fail(409, 'review_state_changed')
  if (target.digest !== input.expectedContentDigest) fail(409, 'review_content_changed')
  if (target.status !== 'draft' || state.state !== 'draft' || !target.bodyHtml) return null
  try {
    return await deps.prepareSubmission!(target)
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    fail(502, 'campaign_asset_preparation_failed')
  }
}

interface ReceiptRow {
  command: ReviewCommandName
  target_kind: ReviewTargetKind
  target_id: string
  payload_sha256: string
  result: ReviewCommandResult
}

async function readReceiptFresh(actorId: string, operationId: string): Promise<ReceiptRow | null> {
  return queryOneFresh<ReceiptRow>(`SELECT command, target_kind, target_id::text, payload_sha256, result
    FROM email_review_operations WHERE actor_id = $1 AND operation_id = $2`, [actorId, operationId])
}

function replayOrReject(prior: ReceiptRow, input: ReviewCommandInput, payloadSha: string): ReviewCommandResult {
  if (prior.command !== input.payload.command || prior.target_kind !== input.kind
    || prior.target_id !== input.targetId || prior.payload_sha256 !== payloadSha) {
    fail(409, 'review_operation_reused')
  }
  return { ...prior.result, replayed: true }
}

/** One serialized, receipt-bound review command. Replays of the same
 * actor/operation with an identical payload return the stored result; any
 * other reuse (different command, target or payload) is rejected. */
export async function runReviewCommand(
  input: ReviewCommandInput,
  authorize: ReviewAuthorizer,
  deps: ReviewServiceDeps = {}
): Promise<ReviewCommandResult> {
  validateInput(input)
  const payloadSha = await reviewPayloadSha256({
    kind: input.kind,
    targetId: input.targetId,
    expectedClientId: input.expectedClientId,
    expectedVersion: input.expectedVersion,
    expectedContentDigest: input.expectedContentDigest,
    payload: input.payload
  })
  const tx = deps.transaction ?? (transactionWithoutRetry as unknown as ReviewTransaction)
  const readReceipt = deps.readReceipt ?? readReceiptFresh
  const workflowEnabled = deps.workflowEnabled ?? true
  // The receipt hash always covers the actor's original request. Only a fresh
  // campaign submit prepares sendable HTML, which the transaction then writes.
  let preparedHtml: string | null = null
  if (input.payload.command === 'submit' && input.kind === 'campaign' && deps.prepareSubmission
    && !await readReceipt(input.actorId, input.operationId)) {
    preparedHtml = await prepareBeforeSubmit(input, authorize, deps, workflowEnabled)
  }
  try {
    return await tx(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`email_review:${input.actorId}:${input.operationId}`])
      const prior = (await db.query(`SELECT command, target_kind, target_id::text, payload_sha256, result
        FROM email_review_operations WHERE actor_id = $1 AND operation_id = $2`, [input.actorId, input.operationId])).rows[0] as ReceiptRow | undefined
      const target = await loadReviewTarget(db, input.kind, input.targetId, !prior)
      if (!target) fail(404, 'review_target_not_found')
      assertScope(target, input.expectedClientId)
      // Fresh stored actor/client authority, even for replays, using the stored owner.
      await authorize(prior ? 'read' : requireAuthority(input.payload.command), target.clientId)
      assertWorkflowReachable(target, workflowEnabled)
      if (prior) return replayOrReject(prior, input, payloadSha)
      const outcome = await applyCommand(db, input, target, preparedHtml, workflowEnabled)
      const result: ReviewCommandResult = { operationId: input.operationId, ...outcome }
      await db.query(`INSERT INTO email_review_operations (actor_id, operation_id, domain, command, target_kind, target_id, payload_sha256, result)
        VALUES ($1, $2, 'email_review', $3, $4, $5, $6, $7::jsonb)`,
      [input.actorId, input.operationId, input.payload.command, input.kind, input.targetId, payloadSha, JSON.stringify(result)])
      return result
    })
  } catch (error) {
    if (getTransactionFailureStage(error) !== 'ambiguous_commit') throw mapReviewDbError(error)
    // Unknown commit: the receipt is the only authority. Never re-execute here.
    const receipt = await readReceipt(input.actorId, input.operationId).catch(() => null)
    if (receipt) return replayOrReject(receipt, input, payloadSha)
    throw createError({ statusCode: 503, statusMessage: 'review_outcome_unknown', data: { operationId: input.operationId } })
  }
}

/** Read back a committed receipt after a lost reply. Absence means the
 * operation did not commit and the identical request may be retried. */
export async function readReviewOperation(
  actorId: string,
  operationId: string,
  authorize: ReviewAuthorizer,
  deps: ReviewServiceDeps = {}
): Promise<ReviewCommandResult | null> {
  if (!UUID.test(actorId) || !UUID.test(operationId)) fail(400, 'invalid_review_operation')
  const receipt = await (deps.readReceipt ?? readReceiptFresh)(actorId, operationId)
  if (!receipt) return null
  const owner = await queryOneFresh<{ client_id: string | null, review_required: boolean | null }>(
    receipt.target_kind === 'campaign'
      ? 'SELECT client_id, review_required FROM campaigns WHERE id = $1'
      : 'SELECT client_id, false AS review_required FROM edm_templates WHERE id = $1',
    [receipt.target_id]
  )
  if (!owner) return null
  await authorize('read', owner.client_id)
  assertWorkflowReachable({ kind: receipt.target_kind, reviewRequired: owner.review_required === true }, deps.workflowEnabled ?? true)
  return { ...receipt.result, replayed: true }
}

export interface ReviewCommentView {
  id: string
  blockId: string | null
  parentId: string | null
  body: string
  authorId: string
  authorName: string | null
  contentDigest: string
  revisionId: string | null
  createdAt: string
  resolvedAt: string | null
  orphaned: boolean
  outdated: boolean
}

export interface ReviewView {
  enabled: true
  targetKind: ReviewTargetKind
  targetId: string
  clientId: string | null
  status: string | null
  reviewRequired: boolean
  contentDigest: string
  revisionId: string | null
  state: ReviewStateName
  version: number
  stateDigest: string | null
  approvalCurrent: boolean
  note: string | null
  submittedBy: string | null
  submittedAt: string | null
  decidedBy: string | null
  decidedAt: string | null
  canReview: boolean
  /** Review authority AND not the submitter of the version in review. */
  canApprove: boolean
  workflowEnabled: boolean
  blocks: ReviewBlock[]
  comments: ReviewCommentView[]
}

export async function getReviewView(
  kind: ReviewTargetKind,
  targetId: string,
  expectedClientId: string | null | undefined,
  authorize: ReviewAuthorizer,
  db: ReviewDb = freshReadDb,
  listComments: (kind: ReviewTargetKind, id: string) => Promise<Array<Record<string, unknown>>> = defaultListComments,
  context: { actorId?: string, workflowEnabled?: boolean } = {}
): Promise<ReviewView> {
  if (!UUID.test(targetId)) fail(404, 'review_target_not_found')
  const workflowEnabled = context.workflowEnabled ?? true
  const target = await loadReviewTarget(db, kind, targetId, false)
  if (!target) fail(404, 'review_target_not_found')
  if (expectedClientId !== undefined) assertScope(target, expectedClientId)
  await authorize('read', target.clientId)
  assertWorkflowReachable(target, workflowEnabled)
  const state = await loadState(db, kind, targetId, false)
  const canReview = await authorize('review', target.clientId).then(() => true, () => false)
  const selfSubmitted = state.state === 'in_review' && (!context.actorId || sameActor(state.submitted_by, context.actorId))
  const blocks = outlineReviewBlocks(target.bodySource)
  const present = new Set(blocks.map(block => block.id))
  const comments = (await listComments(kind, targetId)).map(row => ({
    id: String(row.id),
    blockId: (row.block_id as string | null) ?? null,
    parentId: (row.parent_id as string | null) ?? null,
    body: String(row.body),
    authorId: String(row.author_id),
    authorName: (row.author_name as string | null) ?? null,
    contentDigest: String(row.content_digest),
    revisionId: (row.revision_id as string | null) ?? null,
    createdAt: String(row.created_at),
    resolvedAt: (row.resolved_at as string | null) ?? null,
    orphaned: row.block_id != null && !present.has(String(row.block_id)),
    outdated: String(row.content_digest) !== target.digest
  }))
  return {
    enabled: true,
    targetKind: kind,
    targetId,
    clientId: target.clientId,
    status: target.status,
    reviewRequired: target.reviewRequired,
    contentDigest: target.digest,
    revisionId: target.revisionId,
    state: state.state,
    version: state.version,
    stateDigest: state.content_digest,
    approvalCurrent: approvalIsCurrent(state, target.digest),
    note: state.note,
    submittedBy: state.submitted_by,
    submittedAt: state.submitted_at,
    decidedBy: state.decided_by,
    decidedAt: state.decided_at,
    canReview,
    canApprove: canReview && state.state === 'in_review' && !selfSubmitted,
    workflowEnabled,
    blocks,
    comments
  }
}

async function defaultListComments(kind: ReviewTargetKind, id: string): Promise<Array<Record<string, unknown>>> {
  const { queryRowsFresh } = await import('~~/server/utils/db')
  return queryRowsFresh(`SELECT c.id, c.block_id, c.parent_id, c.body, c.author_id, tm.name AS author_name, c.content_digest,
      c.revision_id, c.created_at::text, c.resolved_at::text
    FROM email_review_comments c LEFT JOIN team_members tm ON tm.id = c.author_id
    WHERE c.target_kind = $1 AND c.target_id = $2 ORDER BY c.created_at, c.id LIMIT 500`, [kind, id])
}

// ── Campaign dispatch gate (application side; the DB trigger is authoritative) ──

export const REVIEW_GATE_CONSTRAINTS = new Set([
  'email_campaign_approval_required', 'email_campaign_content_frozen', 'email_campaign_review_permanent', 'email_review_reply_thread'
])

export function mapReviewDbError(error: unknown): unknown {
  const constraint = (error as { constraint?: unknown } | null)?.constraint
  if (typeof constraint !== 'string' || !REVIEW_GATE_CONSTRAINTS.has(constraint)) return error
  const CODES: Record<string, string> = {
    email_campaign_approval_required: 'campaign_approval_required',
    email_campaign_content_frozen: 'campaign_content_frozen',
    email_review_reply_thread: 'review_thread_not_found',
    email_campaign_review_permanent: 'campaign_review_permanent'
  }
  const message = CODES[constraint]!
  return createError({ statusCode: constraint === 'email_review_reply_thread' ? 422 : 409, statusMessage: message, message: READABLE[message] ?? message })
}

/** Early, readable refusal before any side effect (materialize, mirroring,
 * provider). Legacy campaigns (review_required = false) pass unchanged. Like the
 * database gate, approval of the exact content and audience is required to
 * leave draft or cancelled; a gated campaign already in flight (scheduled,
 * sending, paused, sent) is frozen by the trigger and is not re-judged, so a
 * later list-deletion cascade cannot strand its resume. Unknown status checks. */
export async function assertCampaignApprovalCurrent(
  campaign: { id: string, review_required?: boolean | null, status?: string | null },
  db?: ReviewDb
): Promise<void> {
  if (campaign.review_required !== true) return
  if (campaign.status && !['draft', 'cancelled'].includes(campaign.status)) return
  const sql = `SELECT s.state, s.content_digest, email_campaign_review_digest_of(c) AS digest
    FROM campaigns c LEFT JOIN email_review_states s ON s.target_kind = 'campaign' AND s.target_id = c.id
    WHERE c.id = $1`
  const row = db ? (await db.query(sql, [campaign.id])).rows[0] : await queryOneFresh(sql, [campaign.id])
  if (!row || !approvalIsCurrent({ state: row.state, content_digest: row.content_digest }, row.digest)) {
    fail(409, 'campaign_approval_required')
  }
}
