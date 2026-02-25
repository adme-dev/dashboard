import { requireRole } from '~~/server/utils/auth'
import { uploadKnowledgeBulk } from '~~/server/utils/aiKnowledgeUploader'

const VALID_TYPES = ['sop', 'client_context', 'qa_pair', 'workflow', 'glossary']
const VALID_FORMATS = ['csv', 'jsonl']

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])

  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No form data provided' })
  }

  let fileContent: string | null = null
  let knowledgeType: string | null = null
  let format: string | null = null

  for (const part of formData) {
    if (part.name === 'file' && part.data) {
      fileContent = Buffer.from(part.data).toString('utf-8')
    } else if (part.name === 'knowledgeType' && part.data) {
      knowledgeType = Buffer.from(part.data).toString('utf-8').trim()
    } else if (part.name === 'format' && part.data) {
      format = Buffer.from(part.data).toString('utf-8').trim()
    }
  }

  if (!fileContent) {
    throw createError({ statusCode: 400, statusMessage: 'File is required' })
  }
  if (!knowledgeType || !VALID_TYPES.includes(knowledgeType)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid knowledgeType' })
  }
  if (!format || !VALID_FORMATS.includes(format)) {
    throw createError({ statusCode: 400, statusMessage: 'Format must be csv or jsonl' })
  }

  const result = await uploadKnowledgeBulk(
    fileContent,
    format as 'csv' | 'jsonl',
    knowledgeType as any,
    user.id,
  )

  return result
})
