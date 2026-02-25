/**
 * AI Training Data Extraction Pipeline
 *
 * Extracts training data from existing DB tables (ai_messages, ai_feedback,
 * ai_knowledge_articles, ai_training_knowledge) and outputs OpenAI chat
 * completion JSONL format for fine-tuning.
 */

import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractionOptions {
  minContentLength?: number       // default 50
  onlyPositiveFeedback?: boolean  // default true for chat_qa
  minConfidence?: number          // default 0.6 for intent
  batchSize?: number              // default 500
  sinceDate?: string              // ISO date, optional
}

export interface CombinedOptions extends ExtractionOptions {
  knowledgeRatio?: number           // default 0.30
  includeTypes?: ('chat_qa' | 'intent' | 'knowledge')[]
}

export type DatasetType = 'chat_qa' | 'intent' | 'rag' | 'knowledge' | 'combined'

interface ChatCompletionRow {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
}

interface QualityMetrics {
  avgContentLength: number
  feedbackCoverage: number
  intentDistribution: Record<string, number>
}

// ---------------------------------------------------------------------------
// Anonymization
// ---------------------------------------------------------------------------

async function buildAnonymizationMap(): Promise<Map<string, string>> {
  const members = await queryRows<{ name: string; email: string }>(
    `SELECT name, email FROM team_members WHERE name IS NOT NULL`
  )

  const map = new Map<string, string>()
  let personIndex = 1

  for (const m of members) {
    if (m.name) {
      map.set(m.name, `[PERSON_${personIndex}]`)
      // Also map first name alone if it's multi-word
      const firstName = m.name.split(' ')[0]
      if (firstName && firstName !== m.name) {
        map.set(firstName, `[PERSON_${personIndex}]`)
      }
    }
    if (m.email) {
      map.set(m.email, `[EMAIL_${personIndex}]`)
    }
    personIndex++
  }

  return map
}

function anonymize(text: string, anonMap: Map<string, string>): string {
  let result = text
  // Sort keys by length desc so longer names match first ("John Smith" before "John")
  const sortedKeys = Array.from(anonMap.keys()).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    if (result.includes(key)) {
      result = result.split(key).join(anonMap.get(key)!)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// R2 Upload
// ---------------------------------------------------------------------------

async function uploadToR2(key: string, data: string): Promise<void> {
  const accountId = process.env.R2_ACCOUNT_ID || ''
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || ''
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || ''
  const bucket = process.env.R2_BUCKET_NAME || 'agency-files'

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 storage is not configured for training data upload')
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: data,
    ContentType: 'application/jsonl',
  }))
}

// ---------------------------------------------------------------------------
// Quality helpers
// ---------------------------------------------------------------------------

function computeQualityMetrics(rows: ChatCompletionRow[]): QualityMetrics {
  if (rows.length === 0) {
    return { avgContentLength: 0, feedbackCoverage: 0, intentDistribution: {} }
  }

  let totalLength = 0
  const intentCounts: Record<string, number> = {}

  for (const row of rows) {
    for (const msg of row.messages) {
      totalLength += msg.content.length
    }
    // Use the system prompt category as a rough intent signal
    const systemMsg = row.messages.find(m => m.role === 'system')
    const intent = systemMsg?.content?.slice(0, 60) || 'general'
    intentCounts[intent] = (intentCounts[intent] || 0) + 1
  }

  return {
    avgContentLength: Math.round(totalLength / rows.length),
    feedbackCoverage: 0, // filled by caller when feedback data available
    intentDistribution: intentCounts,
  }
}

function toJsonl(rows: ChatCompletionRow[]): string {
  return rows.map(r => JSON.stringify(r)).join('\n')
}

// ---------------------------------------------------------------------------
// 1. extractChatQAPairs
// ---------------------------------------------------------------------------

export async function extractChatQAPairs(
  options: ExtractionOptions = {}
): Promise<ChatCompletionRow[]> {
  const minLen = options.minContentLength ?? 50
  const posOnly = options.onlyPositiveFeedback ?? true
  const batchSize = options.batchSize ?? 500
  const anonMap = await buildAnonymizationMap()

  const params: any[] = [minLen, batchSize]
  let paramIndex = 3

  let dateFilter = ''
  if (options.sinceDate) {
    dateFilter = `AND u.created_at >= $${paramIndex}`
    params.push(options.sinceDate)
    paramIndex++
  }

  // Join user message with subsequent assistant message in same conversation.
  // Left join feedback so we can filter on it.
  const rows = await queryRows<{
    user_content: string
    assistant_content: string
    system_context: any
    feedback_rating: number | null
  }>(`
    SELECT
      u.content AS user_content,
      a.content AS assistant_content,
      c.system_context,
      f.rating AS feedback_rating
    FROM ai_messages u
    JOIN ai_messages a
      ON a.conversation_id = u.conversation_id
      AND a.role = 'assistant'
      AND a.created_at = (
        SELECT MIN(m2.created_at)
        FROM ai_messages m2
        WHERE m2.conversation_id = u.conversation_id
          AND m2.role = 'assistant'
          AND m2.created_at > u.created_at
      )
    JOIN ai_conversations c ON c.id = u.conversation_id
    LEFT JOIN ai_feedback f ON f.message_id = a.id
    WHERE u.role = 'user'
      AND u.is_error = false
      AND a.is_error = false
      AND LENGTH(u.content) >= $1
      AND LENGTH(a.content) >= $1
      ${dateFilter}
    ORDER BY u.created_at DESC
    LIMIT $2
  `, params)

  const result: ChatCompletionRow[] = []
  let feedbackCount = 0

  for (const row of rows) {
    // Skip negative-feedback rows when posOnly is enabled
    if (posOnly && row.feedback_rating !== null && row.feedback_rating < 0) {
      continue
    }
    if (row.feedback_rating !== null) feedbackCount++

    const systemPrompt = typeof row.system_context === 'object' && row.system_context?.prompt
      ? String(row.system_context.prompt)
      : 'You are a helpful agency assistant for a digital marketing agency.'

    result.push({
      messages: [
        { role: 'system', content: anonymize(systemPrompt, anonMap) },
        { role: 'user', content: anonymize(row.user_content, anonMap) },
        { role: 'assistant', content: anonymize(row.assistant_content, anonMap) },
      ],
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// 2. extractIntentData
// ---------------------------------------------------------------------------

export async function extractIntentData(
  options: ExtractionOptions = {}
): Promise<ChatCompletionRow[]> {
  const minLen = options.minContentLength ?? 50
  const batchSize = options.batchSize ?? 500
  const anonMap = await buildAnonymizationMap()

  const params: any[] = [minLen, batchSize]
  let paramIndex = 3

  let dateFilter = ''
  if (options.sinceDate) {
    dateFilter = `AND m.created_at >= $${paramIndex}`
    params.push(options.sinceDate)
    paramIndex++
  }

  // Use context_sources JSONB to derive intent type from the types of sources used.
  const rows = await queryRows<{
    content: string
    context_sources: any
    assistant_content: string
  }>(`
    SELECT
      m.content,
      m.context_sources,
      a.content AS assistant_content
    FROM ai_messages m
    LEFT JOIN ai_messages a
      ON a.conversation_id = m.conversation_id
      AND a.role = 'assistant'
      AND a.created_at = (
        SELECT MIN(m2.created_at)
        FROM ai_messages m2
        WHERE m2.conversation_id = m.conversation_id
          AND m2.role = 'assistant'
          AND m2.created_at > m.created_at
      )
    WHERE m.role = 'user'
      AND m.is_error = false
      AND LENGTH(m.content) >= $1
      AND m.context_sources IS NOT NULL
      AND m.context_sources != 'null'
      ${dateFilter}
    ORDER BY m.created_at DESC
    LIMIT $2
  `, params)

  const result: ChatCompletionRow[] = []

  for (const row of rows) {
    // Derive intent from context_sources type fields
    let sources: any[] = []
    try {
      sources = Array.isArray(row.context_sources) ? row.context_sources
        : typeof row.context_sources === 'string' ? JSON.parse(row.context_sources)
        : []
    } catch { /* skip malformed */ }

    if (sources.length === 0) continue

    const sourceTypes = Array.from(new Set(sources.map((s: any) => s.type || 'unknown')))
    const intentLabel = deriveIntent(sourceTypes, row.content)

    result.push({
      messages: [
        {
          role: 'system',
          content: 'Classify the user message intent. Respond with a JSON object: {"intent": "<intent_type>", "confidence": <0-1>}',
        },
        { role: 'user', content: anonymize(row.content, anonMap) },
        {
          role: 'assistant',
          content: JSON.stringify({ intent: intentLabel, confidence: 0.9 }),
        },
      ],
    })
  }

  return result
}

/** Derive an intent label from context source types and message content. */
function deriveIntent(sourceTypes: string[], content: string): string {
  const lower = content.toLowerCase()

  if (sourceTypes.includes('spend') || sourceTypes.includes('budget') || /spend|budget|cost|invoice|revenue/i.test(lower)) {
    return 'financial_query'
  }
  if (sourceTypes.includes('task') || sourceTypes.includes('board') || /task|board|status|assign/i.test(lower)) {
    return 'task_query'
  }
  if (sourceTypes.includes('client') || sourceTypes.includes('brief') || /client|brief|project/i.test(lower)) {
    return 'client_query'
  }
  if (sourceTypes.includes('knowledge') || /how|what|why|explain|process/i.test(lower)) {
    return 'process_query'
  }
  return 'general_query'
}

// ---------------------------------------------------------------------------
// 3. extractRAGData
// ---------------------------------------------------------------------------

export async function extractRAGData(
  options: ExtractionOptions = {}
): Promise<ChatCompletionRow[]> {
  const minLen = options.minContentLength ?? 50
  const batchSize = options.batchSize ?? 500
  const anonMap = await buildAnonymizationMap()

  const params: any[] = [minLen, batchSize]
  let paramIndex = 3

  let dateFilter = ''
  if (options.sinceDate) {
    dateFilter = `AND u.created_at >= $${paramIndex}`
    params.push(options.sinceDate)
    paramIndex++
  }

  const rows = await queryRows<{
    user_content: string
    assistant_content: string
    context_sources: any
  }>(`
    SELECT
      u.content AS user_content,
      a.content AS assistant_content,
      u.context_sources
    FROM ai_messages u
    JOIN ai_messages a
      ON a.conversation_id = u.conversation_id
      AND a.role = 'assistant'
      AND a.created_at = (
        SELECT MIN(m2.created_at)
        FROM ai_messages m2
        WHERE m2.conversation_id = u.conversation_id
          AND m2.role = 'assistant'
          AND m2.created_at > u.created_at
      )
    WHERE u.role = 'user'
      AND u.is_error = false
      AND a.is_error = false
      AND LENGTH(u.content) >= $1
      AND LENGTH(a.content) >= $1
      AND u.context_sources IS NOT NULL
      AND u.context_sources != 'null'
      ${dateFilter}
    ORDER BY u.created_at DESC
    LIMIT $2
  `, params)

  const result: ChatCompletionRow[] = []

  for (const row of rows) {
    let sources: any[] = []
    try {
      sources = Array.isArray(row.context_sources) ? row.context_sources
        : typeof row.context_sources === 'string' ? JSON.parse(row.context_sources)
        : []
    } catch { /* skip malformed */ }

    // Build a context block from sources
    const contextBlock = sources
      .slice(0, 5) // Limit context window
      .map((s: any) => `[${s.type || 'info'}] ${s.title || ''}: ${s.snippet || s.content || ''}`)
      .join('\n')

    if (!contextBlock) continue

    result.push({
      messages: [
        {
          role: 'system',
          content: `You are an agency assistant. Use the following context to answer the user's question.\n\n---\n${anonymize(contextBlock, anonMap)}\n---`,
        },
        { role: 'user', content: anonymize(row.user_content, anonMap) },
        { role: 'assistant', content: anonymize(row.assistant_content, anonMap) },
      ],
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// 4. extractKnowledgeDataset
// ---------------------------------------------------------------------------

export async function extractKnowledgeDataset(
  options: ExtractionOptions = {}
): Promise<ChatCompletionRow[]> {
  const minLen = options.minContentLength ?? 50
  const batchSize = options.batchSize ?? 500
  const anonMap = await buildAnonymizationMap()

  const params: any[] = [minLen, batchSize]

  // Approved training knowledge entries
  const trainingKnowledge = await queryRows<{
    knowledge_type: string
    title: string
    content: string
    answer: string | null
    category: string | null
  }>(`
    SELECT knowledge_type, title, content, answer, category
    FROM ai_training_knowledge
    WHERE is_approved = true
      AND LENGTH(content) >= $1
    ORDER BY created_at DESC
    LIMIT $2
  `, params)

  // Published knowledge articles
  const articles = await queryRows<{
    title: string
    content: string
    category: string | null
  }>(`
    SELECT title, content, category
    FROM ai_knowledge_articles
    WHERE is_published = true
      AND LENGTH(content) >= $1
    ORDER BY usefulness_score DESC, updated_at DESC
    LIMIT $2
  `, params)

  const result: ChatCompletionRow[] = []

  // Format training knowledge by type
  for (const k of trainingKnowledge) {
    const row = formatKnowledgeRow(k.knowledge_type, k.title, k.content, k.answer, anonMap)
    if (row) result.push(row)
  }

  // Format published articles as general Q&A
  for (const a of articles) {
    result.push({
      messages: [
        { role: 'system', content: 'You are a knowledgeable agency assistant.' },
        { role: 'user', content: anonymize(`Tell me about ${a.title}`, anonMap) },
        { role: 'assistant', content: anonymize(a.content, anonMap) },
      ],
    })
  }

  return result.slice(0, batchSize)
}

function formatKnowledgeRow(
  type: string,
  title: string,
  content: string,
  answer: string | null,
  anonMap: Map<string, string>
): ChatCompletionRow | null {
  switch (type) {
    case 'sop':
    case 'workflow':
      return {
        messages: [
          { role: 'system', content: "You know the agency's processes and standard operating procedures." },
          { role: 'user', content: anonymize(`How do we handle ${title}?`, anonMap) },
          { role: 'assistant', content: anonymize(content, anonMap) },
        ],
      }
    case 'client_context':
      return {
        messages: [
          { role: 'system', content: 'You know about our clients and their accounts.' },
          { role: 'user', content: anonymize(`Tell me about ${title}`, anonMap) },
          { role: 'assistant', content: anonymize(content, anonMap) },
        ],
      }
    case 'qa_pair':
      return {
        messages: [
          { role: 'system', content: 'You are a helpful agency assistant.' },
          { role: 'user', content: anonymize(title, anonMap) },
          { role: 'assistant', content: anonymize(answer || content, anonMap) },
        ],
      }
    case 'glossary':
      return {
        messages: [
          { role: 'system', content: 'You are a helpful agency assistant.' },
          { role: 'user', content: anonymize(`What does "${title}" mean?`, anonMap) },
          { role: 'assistant', content: anonymize(content, anonMap) },
        ],
      }
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// 5. extractCombinedDataset
// ---------------------------------------------------------------------------

export async function extractCombinedDataset(
  options: CombinedOptions = {}
): Promise<ChatCompletionRow[]> {
  const knowledgeRatio = options.knowledgeRatio ?? 0.30
  const includeTypes = options.includeTypes ?? ['chat_qa', 'intent', 'knowledge']
  const batchSize = options.batchSize ?? 500

  const knowledgeBudget = Math.floor(batchSize * knowledgeRatio)
  const interactionBudget = batchSize - knowledgeBudget

  // Calculate per-interaction-type budget
  const interactionTypes = includeTypes.filter(t => t !== 'knowledge')
  const perTypeBudget = interactionTypes.length > 0
    ? Math.floor(interactionBudget / interactionTypes.length)
    : 0

  const subOptions: ExtractionOptions = {
    minContentLength: options.minContentLength,
    sinceDate: options.sinceDate,
  }

  const batches: ChatCompletionRow[][] = []

  if (includeTypes.includes('chat_qa')) {
    batches.push(await extractChatQAPairs({ ...subOptions, batchSize: perTypeBudget }))
  }
  if (includeTypes.includes('intent')) {
    batches.push(await extractIntentData({ ...subOptions, batchSize: perTypeBudget }))
  }
  if (includeTypes.includes('knowledge')) {
    batches.push(await extractKnowledgeDataset({ ...subOptions, batchSize: knowledgeBudget }))
  }

  // Interleave results for better training distribution
  const combined: ChatCompletionRow[] = []
  const iterators = batches.map(b => b[Symbol.iterator]())
  let active = true

  while (active && combined.length < batchSize) {
    active = false
    for (const iter of iterators) {
      const next = iter.next()
      if (!next.done) {
        combined.push(next.value)
        active = true
        if (combined.length >= batchSize) break
      }
    }
  }

  return combined
}

// ---------------------------------------------------------------------------
// 6. extractAndUpload — Main entry point for queue consumer
// ---------------------------------------------------------------------------

export async function extractAndUpload(
  datasetType: DatasetType,
  options: ExtractionOptions | CombinedOptions,
  userId: string
): Promise<{ datasetId: string; rowCount: number; r2Path: string }> {
  // Auto-increment version
  const versionRow = await queryOne<{ max_version: number }>(
    `SELECT COALESCE(MAX(version), 0) AS max_version
     FROM ai_training_datasets
     WHERE dataset_type = $1`,
    [datasetType]
  )
  const version = (parseInt(String(versionRow?.max_version ?? 0), 10)) + 1

  // Create dataset row
  const dataset = await queryOne<{ id: string }>(
    `INSERT INTO ai_training_datasets (dataset_type, version, status, extraction_options, created_by)
     VALUES ($1, $2, 'extracting', $3, $4)
     RETURNING id`,
    [datasetType, version, JSON.stringify(options), userId]
  )

  if (!dataset) {
    throw new Error('Failed to create dataset record')
  }

  const datasetId = dataset.id

  try {
    // Run the appropriate extractor
    let rows: ChatCompletionRow[]
    switch (datasetType) {
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
        rows = await extractCombinedDataset(options as CombinedOptions)
        break
      default:
        throw new Error(`Unknown dataset type: ${datasetType}`)
    }

    // Build JSONL
    const jsonl = toJsonl(rows)
    const fileSizeBytes = Buffer.byteLength(jsonl, 'utf-8')
    const r2Path = `training-data/${datasetType}/${version}/dataset-${datasetId}.jsonl`

    // Quality metrics
    const metrics = computeQualityMetrics(rows)

    // Update status to uploading
    await execute(
      `UPDATE ai_training_datasets SET status = 'uploading', updated_at = NOW() WHERE id = $1`,
      [datasetId]
    )

    // Upload to R2
    await uploadToR2(r2Path, jsonl)

    // Finalize
    await execute(
      `UPDATE ai_training_datasets
       SET status = 'ready',
           row_count = $2,
           file_size_bytes = $3,
           r2_path = $4,
           quality_metrics = $5,
           updated_at = NOW()
       WHERE id = $1`,
      [datasetId, rows.length, fileSizeBytes, r2Path, JSON.stringify(metrics)]
    )

    return { datasetId, rowCount: rows.length, r2Path }
  } catch (err: any) {
    // Mark as failed
    await execute(
      `UPDATE ai_training_datasets
       SET status = 'failed', error_message = $2, updated_at = NOW()
       WHERE id = $1`,
      [datasetId, err.message?.slice(0, 2000) || 'Unknown error']
    )
    throw err
  }
}
