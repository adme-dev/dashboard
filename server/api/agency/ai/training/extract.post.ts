import { createError, readBody } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { enqueue } from '~~/server/utils/queue'
import type { DatasetType } from '~~/server/utils/aiTrainingDataExtractor'

const VALID_TYPES: DatasetType[] = ['chat_qa', 'intent', 'rag', 'knowledge', 'combined']

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const body = await readBody(event)

  const type = body?.type as DatasetType
  if (!type || !VALID_TYPES.includes(type)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`,
    })
  }

  const options = body?.options || {}

  await enqueue(event, 'training.extract', {
    datasetType: type,
    options,
    userId: user.id,
  })

  return { queued: true, message: 'Extraction job queued' }
})
