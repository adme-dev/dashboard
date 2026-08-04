import { z } from 'zod'
import type { H3Event } from 'h3'
import { requirePermission, requireWriteAccess } from '~~/server/utils/auth'
import { resolveAccessibleBoard } from '~~/server/utils/boardFiles'
import { isIndexableBoardKnowledgeFile, type BoardKnowledgeSourceType } from '~~/server/utils/boardKnowledge/types'
import {
  createSubmission,
  getSubmissionReviewDetailForBoard,
  listBoardKnowledge,
  listQueuedBoardKnowledgeDeindex,
  resolveKnowledgeSource
} from '~~/server/utils/boardKnowledge/repository'
import { transitionSubmission, type BoardKnowledgeTransitionAction } from '~~/server/utils/boardKnowledge/lifecycle'
import { enqueue, type JobType } from '~~/server/utils/queue'

const transitionSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
  reason: z.string().trim().max(2000).optional()
})

function requiredParam(event: H3Event, name: string): string {
  const value = getRouterParam(event, name)
  if (!value) throw createError({ statusCode: 400, statusMessage: `${name} is required` })
  return value
}

export async function submitKnowledgeSource(
  event: H3Event,
  sourceType: BoardKnowledgeSourceType,
  sourceParam: 'fileId' | 'attachmentId'
) {
  const user = await requireWriteAccess(event)
  const board = await resolveAccessibleBoard(event, requiredParam(event, 'id'))
  const source = await resolveKnowledgeSource(board.id, sourceType, requiredParam(event, sourceParam))
  if (!isIndexableBoardKnowledgeFile(source.fileName, source.mimeType)) {
    throw createError({ statusCode: 400, statusMessage: 'This file type can be stored but is not supported for AI knowledge' })
  }
  const submission = await createSubmission({ source, submittedBy: user.id })
  const queued = await enqueue(event, 'knowledge.extract', {
    submissionId: submission.id,
    expectedVersionKey: submission.sourceVersionKey
  })
  setResponseStatus(event, 202)
  return { accepted: true, queued, submission }
}

export async function listKnowledgeForBoard(event: H3Event) {
  const board = await resolveAccessibleBoard(event, requiredParam(event, 'id'))
  return { submissions: await listBoardKnowledge(board.id) }
}

export async function getKnowledgeForBoard(event: H3Event) {
  const board = await resolveAccessibleBoard(event, requiredParam(event, 'id'))
  const detail = await getSubmissionReviewDetailForBoard(requiredParam(event, 'submissionId'), board.id)
  if (!detail) throw createError({ statusCode: 404, statusMessage: 'Knowledge submission not found' })
  return detail
}

export async function transitionKnowledgeForBoard(
  event: H3Event,
  action: BoardKnowledgeTransitionAction,
  queueType?: Extract<JobType, 'knowledge.extract' | 'knowledge.index'>
) {
  const board = await resolveAccessibleBoard(event, requiredParam(event, 'id'))
  const user = await requirePermission(event, 'MANAGEMENT')
  const parsed = transitionSchema.safeParse(await readBody(event).catch(() => null))
  if (!parsed.success || (action === 'reject' && !parsed.data.reason)) {
    throw createError({ statusCode: 400, statusMessage: action === 'reject' ? 'A rejection reason is required' : 'Invalid transition request' })
  }
  const submission = await transitionSubmission({
    submissionId: requiredParam(event, 'submissionId'),
    departmentId: board.id,
    actorId: user.id,
    action,
    expectedUpdatedAt: parsed.data.expectedUpdatedAt,
    reason: parsed.data.reason || null
  })
  let queued = false
  if (queueType) {
    const resolvedQueueType = action === 'retry' && submission.reviewStatus === 'approved'
      ? 'knowledge.index'
      : queueType
    const jobs = [{
      submissionId: submission.id,
      expectedVersionKey: submission.sourceVersionKey
    }]
    if (action === 'approve') {
      const superseded = await listQueuedBoardKnowledgeDeindex(
        submission.departmentId,
        submission.sourceType,
        submission.sourceId,
        submission.id
      )
      jobs.push(...superseded.map(item => ({
        submissionId: item.id,
        expectedVersionKey: item.sourceVersionKey
      })))
    }
    queued = true
    for (const job of jobs) {
      queued = await enqueue(event, resolvedQueueType, job) && queued
    }
    setResponseStatus(event, 202)
  }
  return { accepted: Boolean(queueType), queued, submission }
}
