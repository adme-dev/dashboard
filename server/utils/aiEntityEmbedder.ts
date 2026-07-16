import type { H3Event } from 'h3'
import { queryOne, queryRows, execute } from '~~/server/utils/db'
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

/**
 * Index a client's social brief plus connected publishing history as a client-scoped vector.
 * The shared SOP knowledge tool rejects this vector type; only permission-checked social tools may use it.
 */
export async function embedSocialClientKnowledge(event: H3Event, clientId: string): Promise<void> {
  const profile = await queryOne<any>(`
    SELECT p.*, c.name AS client_name
      FROM social_news_client_profiles p
      JOIN agency_clients c ON c.id = p.client_id
     WHERE p.client_id = $1
  `, [clientId])
  if (!profile) return

  const [accounts, slots, posts, evidence, activePackage] = await Promise.all([
    queryRows<any>(`SELECT platform, account_name FROM social_accounts WHERE client_id = $1 AND is_active = TRUE ORDER BY platform, account_name`, [clientId]),
    queryRows<any>(`SELECT name, platforms, day_of_week, time_of_day, timezone FROM social_slot_schedules WHERE client_id = $1 AND enabled = TRUE ORDER BY day_of_week, time_of_day`, [clientId]),
    queryRows<any>(`
      SELECT p.id, p.content, p.platforms, p.published_at,
             COALESCE(SUM(m.engagements), 0) AS engagements,
             COALESCE(SUM(m.impressions), 0) AS impressions
        FROM social_posts p
        LEFT JOIN social_post_metrics m ON m.post_id = p.id
       WHERE p.client_id = $1 AND p.status = 'published'
       GROUP BY p.id
       ORDER BY p.published_at DESC NULLS LAST
      LIMIT 20`, [clientId]),
    queryRows<any>(`
      SELECT evidence_type, title, COALESCE(NULLIF(summary, ''), LEFT(content, 2000)) AS guidance
        FROM client_operational_evidence
       WHERE client_id = $1 AND review_status = 'approved'
       ORDER BY occurred_at DESC NULLS LAST, created_at DESC
       LIMIT 20`, [clientId]),
    queryOne<any>(`
      SELECT p.name, v.version, a.commercial_scope_snapshot
        FROM social_content_package_assignments a
        JOIN social_content_package_versions v ON v.id = a.package_version_id
        JOIN social_content_packages p ON p.id = v.package_id
       WHERE a.client_id = $1 AND a.status = 'active'
       ORDER BY a.starts_on DESC, a.created_at DESC LIMIT 1`, [clientId]),
  ])

  const textParts = [
    `Client social knowledge: ${profile.client_name}`,
    profile.industry ? `Industry: ${profile.industry}` : '',
    profile.target_audience ? `Audience: ${profile.target_audience}` : '',
    profile.content_pillars?.length ? `Content pillars: ${profile.content_pillars.join(', ')}` : '',
    profile.include_keywords?.length ? `Relevant keywords: ${profile.include_keywords.join(', ')}` : '',
    profile.exclude_keywords?.length ? `Excluded topics: ${profile.exclude_keywords.join(', ')}` : '',
    profile.makes?.length ? `Makes or brands: ${profile.makes.join(', ')}` : '',
    profile.brand_voice ? `Brand voice: ${profile.brand_voice}` : '',
    profile.ai_instructions ? `AI instructions: ${profile.ai_instructions}` : '',
    activePackage ? `Active content package: ${activePackage.name} version ${activePackage.version}; scope ${JSON.stringify(activePackage.commercial_scope_snapshot || {})}` : '',
    evidence.length ? `Approved XeroFlow client guidance:\n${evidence.map(e => `- [${e.evidence_type}] ${e.title}: ${e.guidance}`).join('\n')}` : '',
    accounts.length ? `Connected social profiles:\n${accounts.map(a => `- ${a.platform}: ${a.account_name || 'account'}`).join('\n')}` : '',
    slots.length ? `Saved posting slots:\n${slots.map(s => `- ${s.name}: day ${s.day_of_week} ${s.time_of_day} ${s.timezone}; ${s.platforms?.join(', ') || 'all platforms'}`).join('\n')}` : '',
    posts.length ? `Recent published social feed:\n${posts.map(p => `- ${p.published_at || 'date unknown'} [${p.platforms?.join(', ') || 'platform unknown'}] ${String(p.content || '').slice(0, 240)} (engagements ${p.engagements}, impressions ${p.impressions})`).join('\n')}` : '',
  ].filter(Boolean).join('\n')

  const contentHash = await hashContent(textParts)
  if (!(await shouldReembed('social_client_knowledge', clientId, contentHash))) return
  const embedding = await generateEmbedding(event, textParts)
  if (embedding.length === 0) return

  const vectorId = `social-client-${clientId}`
  await upsertVector(event, vectorId, embedding, {
    type: 'social_client_knowledge',
    id: clientId,
    clientId,
    title: `${profile.client_name} social knowledge`,
    industry: profile.industry || '',
  })
  await logEmbedding('social_client_knowledge', clientId, vectorId, contentHash)
  await execute(`UPDATE social_news_client_profiles SET knowledge_embedding_id = $2 WHERE client_id = $1`, [clientId, vectorId])
}
