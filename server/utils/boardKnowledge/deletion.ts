import type { H3Event } from 'h3'
import {
  archiveKnowledgeSourceForDeletion,
  guardKnowledgeSourceDeletion
} from '~~/server/utils/boardKnowledge/lifecycle'
import type { BoardKnowledgeSourceType } from '~~/server/utils/boardKnowledge/types'
import { enqueue } from '~~/server/utils/queue'

export interface PrepareKnowledgeSourceDeletionInput {
  departmentId: string
  sourceType: BoardKnowledgeSourceType
  sourceId: string
  actorId: string
}

export interface PrepareKnowledgeSourceDeletionResult {
  archived: boolean
  queued: boolean
}

export async function prepareKnowledgeSourceDeletion(
  event: H3Event,
  input: PrepareKnowledgeSourceDeletionInput
): Promise<PrepareKnowledgeSourceDeletionResult> {
  const decision = await guardKnowledgeSourceDeletion({
    departmentId: input.departmentId,
    sourceType: input.sourceType,
    sourceId: input.sourceId
  })

  if (decision === 'blocked_extraction') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Knowledge extraction or indexing is in progress'
    })
  }

  const archived = await archiveKnowledgeSourceForDeletion({
    departmentId: input.departmentId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    actorId: input.actorId
  })
  if (archived.length === 0) return { archived: false, queued: false }

  let queued = true
  let dispatchAttempted = false
  for (const submission of archived) {
    if (submission.indexStatus !== 'queued') continue
    dispatchAttempted = true
    try {
      queued = await enqueue(event, 'knowledge.index', {
        submissionId: submission.id,
        expectedVersionKey: submission.sourceVersionKey
      }) && queued
    } catch (error) {
      queued = false
      console.warn('Archived board knowledge but could not dispatch de-indexing:', error)
    }
  }
  return { archived: true, queued: dispatchAttempted && queued }
}
