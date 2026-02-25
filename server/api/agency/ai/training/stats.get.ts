import { queryRows, queryCount } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import type { TrainingPipelineStats } from '~/types'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const [
    datasetsByTypeStatus,
    totalKnowledge,
    approvedKnowledge,
    totalAdapters,
    activeAdapters,
    lastChatQaDataset,
    lastIntentDataset,
    lastKnowledgeDataset,
  ] = await Promise.all([
    queryRows(`
      SELECT dataset_type, status, COUNT(*)::int as count
      FROM ai_training_datasets
      GROUP BY dataset_type, status
    `),
    queryCount(`SELECT COUNT(*) as count FROM ai_training_knowledge`),
    queryCount(`SELECT COUNT(*) as count FROM ai_training_knowledge WHERE is_approved = true`),
    queryCount(`SELECT COUNT(*) as count FROM ai_lora_adapters`),
    queryCount(`SELECT COUNT(*) as count FROM ai_lora_adapters WHERE status = 'active'`),
    queryRows<{ created_at: string }>(`
      SELECT created_at FROM ai_training_datasets
      WHERE dataset_type = 'chat_qa'
      ORDER BY created_at DESC LIMIT 1
    `),
    queryRows<{ created_at: string }>(`
      SELECT created_at FROM ai_training_datasets
      WHERE dataset_type = 'intent'
      ORDER BY created_at DESC LIMIT 1
    `),
    queryRows<{ created_at: string }>(`
      SELECT created_at FROM ai_training_datasets
      WHERE dataset_type = 'knowledge'
      ORDER BY created_at DESC LIMIT 1
    `),
  ])

  const totalDatasets = datasetsByTypeStatus.reduce((sum: number, r: any) => sum + r.count, 0)

  // Count new data since last extraction for each type
  const chatQaSince = lastChatQaDataset[0]?.created_at || null
  const intentSince = lastIntentDataset[0]?.created_at || null
  const knowledgeSince = lastKnowledgeDataset[0]?.created_at || null

  const [newChatQa, newIntent, newKnowledge] = await Promise.all([
    chatQaSince
      ? queryCount(`SELECT COUNT(*) as count FROM ai_messages WHERE created_at > $1`, [chatQaSince])
      : queryCount(`SELECT COUNT(*) as count FROM ai_messages`),
    intentSince
      ? queryCount(`SELECT COUNT(*) as count FROM ai_messages WHERE created_at > $1`, [intentSince])
      : queryCount(`SELECT COUNT(*) as count FROM ai_messages`),
    knowledgeSince
      ? queryCount(`SELECT COUNT(*) as count FROM ai_training_knowledge WHERE is_approved = true AND created_at > $1`, [knowledgeSince])
      : queryCount(`SELECT COUNT(*) as count FROM ai_training_knowledge WHERE is_approved = true`),
  ])

  const stats: TrainingPipelineStats = {
    totalDatasets,
    totalKnowledgeEntries: totalKnowledge,
    approvedKnowledgeEntries: approvedKnowledge,
    totalAdapters,
    activeAdapters,
    newDataSince: {
      chat_qa: { count: newChatQa, since: chatQaSince },
      intent: { count: newIntent, since: intentSince },
      knowledge: { count: newKnowledge, since: knowledgeSince },
    },
  }

  return stats
})
