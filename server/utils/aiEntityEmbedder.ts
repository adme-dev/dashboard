import type { H3Event } from 'h3'
import { queryOne, execute } from '~~/server/utils/db'
import { generateEmbedding, upsertVector } from '~~/server/utils/aiVectorize'

/**
 * Entity embedding pipeline — embeds tasks, briefs, and clients for semantic search.
 * Each entity is embedded with contextual information for better search relevance.
 * Uses SHA-256 change detection to avoid re-embedding unchanged content.
 */

async function hashContent(content: string): Promise<string> {
  const data = new TextEncoder().encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function shouldReembed(entityType: string, entityId: string, contentHash: string): Promise<boolean> {
  const existing = await queryOne<any>(`
    SELECT content_hash FROM ai_embeddings_log
    WHERE entity_type = $1 AND entity_id = $2
  `, [entityType, entityId])
  return existing?.content_hash !== contentHash
}

async function logEmbedding(entityType: string, entityId: string, vectorId: string, contentHash: string): Promise<void> {
  await execute(`
    INSERT INTO ai_embeddings_log (entity_type, entity_id, vector_id, content_hash)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET vector_id = EXCLUDED.vector_id,
        content_hash = EXCLUDED.content_hash,
        created_at = NOW()
  `, [entityType, entityId, vectorId, contentHash])
}

/**
 * Embed a task with its board, assignee, and client context.
 */
export async function embedTask(event: H3Event, taskId: string): Promise<void> {
  const task = await queryOne<any>(`
    SELECT t.id, t.name, t.description, t.priority, t.status,
           d.name as board_name,
           tm.name as assignee_name,
           ac.name as client_name
    FROM tasks t
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN team_members tm ON tm.id = t.assignee_id
    LEFT JOIN agency_clients ac ON ac.id = t.client_id
    WHERE t.id = $1
  `, [taskId])

  if (!task) return

  const textParts = [
    `Task: ${task.name}`,
    task.description ? `Description: ${task.description}` : '',
    task.board_name ? `Board: ${task.board_name}` : '',
    task.assignee_name ? `Assignee: ${task.assignee_name}` : '',
    task.client_name ? `Client: ${task.client_name}` : '',
    task.priority ? `Priority: ${task.priority}` : '',
    task.status ? `Status: ${task.status}` : '',
  ].filter(Boolean).join('\n')

  const contentHash = await hashContent(textParts)
  if (!(await shouldReembed('task', taskId, contentHash))) return

  const embedding = await generateEmbedding(event, textParts)
  if (embedding.length === 0) return

  const vectorId = `task-${taskId}`
  await upsertVector(event, vectorId, embedding, {
    type: 'task',
    id: taskId,
    title: task.name,
    board: task.board_name || '',
  })
  await logEmbedding('task', taskId, vectorId, contentHash)
}

/**
 * Embed a brief with its client and tags context.
 */
export async function embedBrief(event: H3Event, briefId: string): Promise<void> {
  const brief = await queryOne<any>(`
    SELECT b.id, b.title, b.description, b.brief_type, b.status,
           ac.name as client_name,
           b.tags
    FROM briefs b
    LEFT JOIN agency_clients ac ON ac.id = b.client_id
    WHERE b.id = $1
  `, [briefId])

  if (!brief) return

  const textParts = [
    `Brief: ${brief.title}`,
    brief.description ? `Description: ${brief.description}` : '',
    brief.brief_type ? `Type: ${brief.brief_type}` : '',
    brief.client_name ? `Client: ${brief.client_name}` : '',
    brief.status ? `Status: ${brief.status}` : '',
    brief.tags?.length ? `Tags: ${brief.tags.join(', ')}` : '',
  ].filter(Boolean).join('\n')

  const contentHash = await hashContent(textParts)
  if (!(await shouldReembed('brief', briefId, contentHash))) return

  const embedding = await generateEmbedding(event, textParts)
  if (embedding.length === 0) return

  const vectorId = `brief-${briefId}`
  await upsertVector(event, vectorId, embedding, {
    type: 'brief',
    id: briefId,
    title: brief.title,
    client: brief.client_name || '',
  })
  await logEmbedding('brief', briefId, vectorId, contentHash)
}

/**
 * Embed a rate card item with category and pricing context.
 */
export async function embedRateCard(event: H3Event, itemId: string): Promise<void> {
  const item = await queryOne<any>(`
    SELECT i.id, i.service_name, i.price, i.price_unit, i.setup_fee, i.notes,
           c.name AS category_name
    FROM rate_card_items i
    JOIN rate_card_categories c ON c.id = i.category_id
    WHERE i.id = $1
  `, [itemId])

  if (!item) return

  const textParts = [
    `Rate Card: ${item.category_name} — ${item.service_name}`,
    `Price: $${Number(item.price).toFixed(2)} ${item.price_unit}`,
    item.setup_fee > 0 ? `Setup Fee: $${Number(item.setup_fee).toFixed(2)}` : '',
    item.notes ? `Notes: ${item.notes}` : '',
  ].filter(Boolean).join('\n')

  const contentHash = await hashContent(textParts)
  if (!(await shouldReembed('rate_card', itemId, contentHash))) return

  const embedding = await generateEmbedding(event, textParts)
  if (embedding.length === 0) return

  const vectorId = `rate_card-${itemId}`
  await upsertVector(event, vectorId, embedding, {
    type: 'rate_card',
    id: itemId,
    title: item.service_name,
    category: item.category_name,
  })
  await logEmbedding('rate_card', itemId, vectorId, contentHash)
}

/**
 * Embed a client with their industry and notes context.
 */
export async function embedClient(event: H3Event, clientId: string): Promise<void> {
  const client = await queryOne<any>(`
    SELECT id, name, industry, notes, contact_name, contact_email
    FROM agency_clients
    WHERE id = $1
  `, [clientId])

  if (!client) return

  const textParts = [
    `Client: ${client.name}`,
    client.industry ? `Industry: ${client.industry}` : '',
    client.contact_name ? `Contact: ${client.contact_name}` : '',
    client.notes ? `Notes: ${client.notes}` : '',
  ].filter(Boolean).join('\n')

  const contentHash = await hashContent(textParts)
  if (!(await shouldReembed('client', clientId, contentHash))) return

  const embedding = await generateEmbedding(event, textParts)
  if (embedding.length === 0) return

  const vectorId = `client-${clientId}`
  await upsertVector(event, vectorId, embedding, {
    type: 'client',
    id: clientId,
    title: client.name,
    industry: client.industry || '',
  })
  await logEmbedding('client', clientId, vectorId, contentHash)
}
