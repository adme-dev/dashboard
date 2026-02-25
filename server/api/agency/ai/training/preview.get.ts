import { createError, getQuery } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import {
  extractChatQAPairs,
  extractIntentData,
  extractRAGData,
  extractKnowledgeDataset,
  extractCombinedDataset,
} from '~~/server/utils/aiTrainingDataExtractor'
import type { DatasetType } from '~~/server/utils/aiTrainingDataExtractor'

const VALID_TYPES: DatasetType[] = ['chat_qa', 'intent', 'rag', 'knowledge', 'combined']

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const query = getQuery(event)
  const type = query.type as DatasetType
  const limit = Math.min(Math.max(parseInt(query.limit as string) || 10, 1), 50)

  if (!type || !VALID_TYPES.includes(type)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`,
    })
  }

  const options = { batchSize: limit }

  let rows
  switch (type) {
    case 'chat_qa':
      rows = await extractChatQAPairs(options)
      break
    case 'intent':
      rows = await extractIntentData(options)
      break
    case 'rag':
      rows = await extractRAGData(options)
      break
    case 'knowledge':
      rows = await extractKnowledgeDataset(options)
      break
    case 'combined':
      rows = await extractCombinedDataset(options)
      break
  }

  return { type, count: rows.length, rows }
})
