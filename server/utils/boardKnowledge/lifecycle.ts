import { createError } from 'h3'
import { queryOne, transaction } from '~~/server/utils/db'
import {
  mapBoardKnowledgeSubmission,
  recordKnowledgeAudit,
  type BoardKnowledgeQueryClient,
  type BoardKnowledgeSubmissionRow
} from '~~/server/utils/boardKnowledge/repository'
import type {
  BoardKnowledgeExtractionStatus,
  BoardKnowledgeIndexStatus,
  BoardKnowledgeReviewStatus,
  BoardKnowledgeSourceType,
  BoardKnowledgeSubmission
} from '~~/server/utils/boardKnowledge/types'

export type BoardKnowledgeTransitionAction = 'approve' | 'reject' | 'retry' | 'archive'
export type BoardKnowledgeDeletionDecision = 'clear' | 'archive_required' | 'blocked_extraction'

export interface BoardKnowledgeState extends Record<string, unknown> {
  review: BoardKnowledgeReviewStatus
  extraction: BoardKnowledgeExtractionStatus
  index: BoardKnowledgeIndexStatus
}

export interface TransitionBoardKnowledgeInput {
  submissionId: string
  departmentId: string
  actorId: string
  action: BoardKnowledgeTransitionAction
  expectedUpdatedAt: string
  reason?: string | null
}

export interface GuardBoardKnowledgeSourceDeletionInput {
  departmentId: string
  sourceType: BoardKnowledgeSourceType
  sourceId: string
}

interface DeletionStateRow {
  review_status: BoardKnowledgeReviewStatus
  extraction_status: BoardKnowledgeExtractionStatus
  index_status: BoardKnowledgeIndexStatus
}

function stateFromRow(row: BoardKnowledgeSubmissionRow): BoardKnowledgeState {
  return {
    review: row.review_status,
    extraction: row.extraction_status,
    index: row.index_status
  }
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

export function canTransitionBoardKnowledge(state: BoardKnowledgeState, action: BoardKnowledgeTransitionAction): boolean {
  switch (action) {
    case 'approve':
    case 'reject':
      return state.review === 'pending' && state.extraction === 'ready' && state.index === 'not_indexed'
    case 'retry':
      return state.review === 'pending' && state.extraction === 'failed' && state.index !== 'indexing'
    case 'archive':
      return state.review !== 'archived' && state.extraction !== 'processing' && state.index !== 'indexing'
  }
}

function transitionConflict(): never {
  throw createError({
    statusCode: 409,
    statusMessage: 'Knowledge submission changed; refresh and try again'
  })
}

async function updateArticlePublication(
  client: BoardKnowledgeQueryClient,
  articleId: string,
  published: boolean,
  reviewStatus: 'approved' | 'rejected',
  actorId: string
): Promise<void> {
  await client.query(`
    UPDATE ai_knowledge_articles
    SET
      is_published = $2,
      review_status = $3,
      reviewed_by = $4,
      reviewed_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
  `, [articleId, published, reviewStatus, actorId])
}

async function unpublishApprovedArticle(
  client: BoardKnowledgeQueryClient,
  articleId: string,
  actorId: string
): Promise<void> {
  await client.query(`
    UPDATE ai_knowledge_articles
    SET
      is_published = false,
      reviewed_by = $2,
      reviewed_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
  `, [articleId, actorId])
}

async function transitionApproval(
  client: BoardKnowledgeQueryClient,
  row: BoardKnowledgeSubmissionRow,
  input: TransitionBoardKnowledgeInput
): Promise<BoardKnowledgeSubmissionRow> {
  if (!row.ai_knowledge_article_id) transitionConflict()

  const superseded = await client.query(`
    UPDATE board_knowledge_submissions
    SET
      review_status = 'archived',
      index_status = 'queued',
      reviewed_at = NOW(),
      updated_at = NOW()
    WHERE department_id = $1
      AND source_type = $2
      AND source_entity_id = $3
      AND id <> $4
      AND review_status = 'approved'
    RETURNING ai_knowledge_article_id
  `, [row.department_id, row.source_type, row.source_entity_id, row.id])

  const supersededArticleIds = (superseded.rows || [])
    .map(value => (value as { ai_knowledge_article_id?: string | null }).ai_knowledge_article_id)
    .filter((value): value is string => Boolean(value))

  if (supersededArticleIds.length > 0) {
    await client.query(`
      UPDATE ai_knowledge_articles
      SET is_published = false, updated_at = NOW()
      WHERE id = ANY($1::uuid[])
    `, [supersededArticleIds])
  }

  await updateArticlePublication(client, row.ai_knowledge_article_id, true, 'approved', input.actorId)

  const updated = await client.query(`
    UPDATE board_knowledge_submissions
    SET
      review_status = 'approved',
      reviewed_by = $2,
      reviewed_at = NOW(),
      review_reason = NULLIF($3, ''),
      index_status = 'queued',
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [row.id, input.actorId, input.reason?.trim() || null])
  return updated.rows?.[0] as BoardKnowledgeSubmissionRow
}

async function transitionRejection(
  client: BoardKnowledgeQueryClient,
  row: BoardKnowledgeSubmissionRow,
  input: TransitionBoardKnowledgeInput
): Promise<BoardKnowledgeSubmissionRow> {
  if (row.ai_knowledge_article_id) {
    await updateArticlePublication(client, row.ai_knowledge_article_id, false, 'rejected', input.actorId)
  }
  const updated = await client.query(`
    UPDATE board_knowledge_submissions
    SET
      review_status = 'rejected',
      reviewed_by = $2,
      reviewed_at = NOW(),
      review_reason = NULLIF($3, ''),
      index_status = 'not_indexed',
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [row.id, input.actorId, input.reason?.trim() || null])
  return updated.rows?.[0] as BoardKnowledgeSubmissionRow
}

async function transitionRetry(
  client: BoardKnowledgeQueryClient,
  row: BoardKnowledgeSubmissionRow
): Promise<BoardKnowledgeSubmissionRow> {
  const updated = await client.query(`
    UPDATE board_knowledge_submissions
    SET
      extraction_status = 'queued',
      extraction_method = NULL,
      extraction_provider = NULL,
      extraction_model = NULL,
      extraction_started_at = NULL,
      extraction_completed_at = NULL,
      extraction_error_code = NULL,
      extraction_error_message = NULL,
      index_status = 'not_indexed',
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [row.id])
  return updated.rows?.[0] as BoardKnowledgeSubmissionRow
}

async function transitionArchive(
  client: BoardKnowledgeQueryClient,
  row: BoardKnowledgeSubmissionRow,
  input: TransitionBoardKnowledgeInput
): Promise<BoardKnowledgeSubmissionRow> {
  if (row.ai_knowledge_article_id) {
    await unpublishApprovedArticle(client, row.ai_knowledge_article_id, input.actorId)
  }
  const updated = await client.query(`
    UPDATE board_knowledge_submissions
    SET
      review_status = 'archived',
      reviewed_by = $2,
      reviewed_at = NOW(),
      review_reason = COALESCE(NULLIF($3, ''), review_reason),
      index_status = CASE
        WHEN ai_knowledge_article_id IS NULL THEN 'removed'
        ELSE 'queued'
      END,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [row.id, input.actorId, input.reason?.trim() || null])
  return updated.rows?.[0] as BoardKnowledgeSubmissionRow
}

export async function transitionSubmission(input: TransitionBoardKnowledgeInput): Promise<BoardKnowledgeSubmission> {
  return transaction(async databaseClient => {
    const client = databaseClient as unknown as BoardKnowledgeQueryClient
    const locked = await client.query(`
      SELECT *
      FROM board_knowledge_submissions
      WHERE id = $1 AND department_id = $2
      FOR UPDATE
    `, [input.submissionId, input.departmentId])
    const row = locked.rows?.[0] as BoardKnowledgeSubmissionRow | undefined
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Knowledge submission not found' })
    if (iso(row.updated_at) !== input.expectedUpdatedAt || !canTransitionBoardKnowledge(stateFromRow(row), input.action)) {
      transitionConflict()
    }

    let updated: BoardKnowledgeSubmissionRow
    switch (input.action) {
      case 'approve':
        updated = await transitionApproval(client, row, input)
        break
      case 'reject':
        updated = await transitionRejection(client, row, input)
        break
      case 'retry':
        updated = await transitionRetry(client, row)
        break
      case 'archive':
        updated = await transitionArchive(client, row, input)
        break
    }
    if (!updated) transitionConflict()

    await recordKnowledgeAudit({
      submissionId: row.id,
      action: input.action,
      actorId: input.actorId,
      previousState: stateFromRow(row),
      nextState: stateFromRow(updated)
    }, client)

    return mapBoardKnowledgeSubmission(updated)
  })
}

export async function guardKnowledgeSourceDeletion(
  input: GuardBoardKnowledgeSourceDeletionInput
): Promise<BoardKnowledgeDeletionDecision> {
  const row = await queryOne<DeletionStateRow>(`
    SELECT review_status, extraction_status, index_status
    FROM board_knowledge_submissions
    WHERE department_id = $1
      AND source_type = $2
      AND source_entity_id = $3
    ORDER BY created_at DESC
    LIMIT 1
  `, [input.departmentId, input.sourceType, input.sourceId])

  if (!row || (row.review_status === 'archived' && row.index_status !== 'indexing')) return 'clear'
  if (row.extraction_status === 'processing' || row.index_status === 'indexing') return 'blocked_extraction'
  return 'archive_required'
}
