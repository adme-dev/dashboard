// Client helpers for the M06 review workflow. A command body is frozen at the
// moment the user acts; retries resend the identical body (same operationId)
// so a lost reply can never apply twice, and later local edits (typing more
// into the composer, newer content) never alter the pending action.

export type ReviewKind = 'template' | 'campaign'
export type ReviewStateName = 'draft' | 'in_review' | 'approved'

export interface ReviewBlock { id: string, type: string, depth: number, label: string }
export interface ReviewComment {
  id: string
  blockId: string | null
  parentId: string | null
  body: string
  authorId: string
  authorName: string | null
  contentDigest: string
  createdAt: string
  resolvedAt: string | null
  orphaned: boolean
  outdated: boolean
}
export interface ReviewView {
  targetKind: ReviewKind
  targetId: string
  clientId: string | null
  status: string | null
  reviewRequired: boolean
  contentDigest: string
  state: ReviewStateName
  version: number
  approvalCurrent: boolean
  note: string | null
  submittedAt: string | null
  decidedAt: string | null
  canReview: boolean
  blocks: ReviewBlock[]
  comments: ReviewComment[]
}

export type ReviewCommandDetails
  = | { command: 'comment', blockId: string | null, parentId: string | null, body: string }
    | { command: 'resolve_comment', commentId: string, resolved: boolean }
    | { command: 'submit' }
    | { command: 'approve' }
    | { command: 'request_changes', note: string }
    | { command: 'require_review' }

export type ReviewCommandBody = {
  version: 1
  operationId: string
  scope: { clientId: string | null }
  expectedVersion: number
  expectedContentDigest: string
} & ReviewCommandDetails

export type PendingPhase = 'sending' | 'unknown' | 'conflict' | 'rejected'
export interface PendingReviewAction {
  readonly kind: ReviewKind
  readonly targetId: string
  readonly body: Readonly<ReviewCommandBody>
  phase: PendingPhase
  message: string | null
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function newOperationId(): string {
  return globalThis.crypto.randomUUID()
}

/** Binds the exact state/content the user saw; never trusts later view data. */
export function buildReviewCommand(view: Pick<ReviewView, 'clientId' | 'version' | 'contentDigest'>, details: ReviewCommandDetails): Readonly<ReviewCommandBody> {
  const body = {
    version: 1 as const,
    operationId: newOperationId(),
    scope: { clientId: view.clientId },
    expectedVersion: view.version,
    expectedContentDigest: view.contentDigest,
    ...JSON.parse(JSON.stringify(details)) as ReviewCommandDetails
  }
  return deepFreeze(body)
}

export function pendingAction(kind: ReviewKind, targetId: string, body: Readonly<ReviewCommandBody>): PendingReviewAction {
  return { kind, targetId, body, phase: 'sending', message: null }
}

export type ReviewErrorClass = 'unknown' | 'conflict' | 'rejected'

/** Network failures and 5xx (including review_outcome_unknown) leave the
 * outcome unknown: retry the identical body or read the receipt back. */
export function classifyReviewError(error: unknown): { kind: ReviewErrorClass, code: string | null } {
  const e = error as { statusCode?: number, status?: number, response?: { status?: number }, data?: { statusMessage?: string }, statusMessage?: string } | null
  const status = e?.statusCode ?? e?.status ?? e?.response?.status
  const code = e?.data?.statusMessage ?? e?.statusMessage ?? null
  if (!status || status >= 500) return { kind: 'unknown', code }
  if (status === 409) return { kind: 'conflict', code }
  return { kind: 'rejected', code }
}

const MESSAGES: Record<string, string> = {
  review_state_changed: 'Someone else changed the review state. Reload to see the latest decision.',
  review_content_changed: 'The email changed since you loaded it. Reload, then re-apply this action to the new version.',
  review_operation_reused: 'This action id was already used for something else. Discard it and try again.',
  review_not_in_review: 'This email is not waiting for review any more.',
  review_not_draft: 'This email is already in review or approved.',
  review_target_frozen: 'Scheduled and sent campaigns are frozen and cannot change review state.',
  review_block_not_found: 'That block no longer exists in the saved email.',
  review_thread_not_found: 'That comment thread is no longer available.',
  design_access_denied: 'You no longer have access to review this email.',
  review_session_invalid: 'Your session expired. Sign in again, then retry.',
  campaign_asset_preparation_failed: 'Images could not be prepared for sending. Check external image links and retry.'
}

export function describeReviewError(code: string | null, fallback: string): string {
  return (code && MESSAGES[code]) || fallback
}

export function commentThreads(comments: ReviewComment[]): Array<ReviewComment & { replies: ReviewComment[] }> {
  const roots = comments.filter(comment => !comment.parentId)
  return roots.map(root => ({ ...root, replies: comments.filter(comment => comment.parentId === root.id) }))
}

export function shortDigest(digest: string | null | undefined): string {
  return digest ? digest.slice(0, 10) : '—'
}
