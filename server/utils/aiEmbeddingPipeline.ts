import type { H3Event } from 'h3'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { generateEmbedding, upsertVector } from '~~/server/utils/aiVectorize'
import { createHash } from 'uncrypto'

/**
 * Generate a SHA-256 hash of content for change detection.
 */
async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Embed a knowledge article and store its vector in Vectorize.
 * Also logs the embedding in ai_embeddings_log.
 */
export async function embedKnowledgeArticle(event?: H3Event, articleId?: string): Promise<void> {
  // Backward compat: if first arg is a string, treat as articleId
  if (typeof event === 'string') {
    articleId = event
    event = undefined
  }
  const article = await queryOne<any>(`
    SELECT id, title, content, category, tags
    FROM ai_knowledge_articles
    WHERE id = $1
  `, [articleId])

  if (!article) {
    console.warn(`[embeddingPipeline] Article ${articleId} not found`)
    return
  }

  // Build the text to embed: title + content + tags
  const textToEmbed = [
    article.title,
    article.content,
    ...(article.tags || []),
  ].join('\n')

  const contentHash = await hashContent(textToEmbed)

  // Check if already embedded with same content
  const existing = await queryOne<any>(`
    SELECT content_hash FROM ai_embeddings_log
    WHERE entity_type = 'knowledge_article' AND entity_id = $1
  `, [articleId])

  if (existing?.content_hash === contentHash) {
    return // Content hasn't changed, skip re-embedding
  }

  const embedding = event ? await generateEmbedding(event, textToEmbed) : await generateEmbedding(textToEmbed)
  if (embedding.length === 0) {
    console.warn(`[embeddingPipeline] Failed to generate embedding for article ${articleId}`)
    return
  }

  const vectorId = `kb-${articleId}`

  if (event) {
    await upsertVector(event, vectorId, embedding, {
      type: 'knowledge_article',
      id: articleId!,
      title: article.title,
      category: article.category || '',
    })
  } else {
    await upsertVector(vectorId, embedding, {
      type: 'knowledge_article',
      id: articleId!,
      title: article.title,
      category: article.category || '',
    })
  }

  // Log the embedding
  await execute(`
    INSERT INTO ai_embeddings_log (entity_type, entity_id, vector_id, content_hash)
    VALUES ('knowledge_article', $1, $2, $3)
    ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET vector_id = EXCLUDED.vector_id,
        content_hash = EXCLUDED.content_hash,
        created_at = NOW()
  `, [articleId, vectorId, contentHash])

  // Update the article's embedding_id
  await execute(`
    UPDATE ai_knowledge_articles SET embedding_id = $2, updated_at = NOW()
    WHERE id = $1
  `, [articleId, vectorId])
}

/**
 * Embed an AI Q&A pair (user question + assistant response) from ai_messages.
 * Used to build learned patterns from positive feedback.
 */
export async function embedAiQAPair(eventOrId: H3Event | string, messageIdArg?: string): Promise<void> {
  let event: H3Event | undefined
  let messageId: string
  if (typeof eventOrId === 'string') {
    messageId = eventOrId
  } else {
    event = eventOrId
    messageId = messageIdArg!
  }
  // The messageId is the assistant message; get the preceding user message
  const assistantMsg = await queryOne<any>(`
    SELECT id, conversation_id, content, created_at
    FROM ai_messages
    WHERE id = $1 AND role = 'assistant'
  `, [messageId])

  if (!assistantMsg) {
    console.warn(`[embeddingPipeline] Assistant message ${messageId} not found`)
    return
  }

  // Find the most recent user message before this assistant reply
  const userMsg = await queryOne<any>(`
    SELECT content
    FROM ai_messages
    WHERE conversation_id = $1
      AND role = 'user'
      AND created_at < $2
    ORDER BY created_at DESC
    LIMIT 1
  `, [assistantMsg.conversation_id, assistantMsg.created_at])

  if (!userMsg) {
    return
  }

  const textToEmbed = `Question: ${userMsg.content}\nAnswer: ${assistantMsg.content}`
  const contentHash = await hashContent(textToEmbed)

  // Check existing
  const existing = await queryOne<any>(`
    SELECT content_hash FROM ai_embeddings_log
    WHERE entity_type = 'qa_pair' AND entity_id = $1
  `, [messageId])

  if (existing?.content_hash === contentHash) {
    return
  }

  const embedding = event ? await generateEmbedding(event, textToEmbed) : await generateEmbedding(textToEmbed)
  if (embedding.length === 0) {
    return
  }

  const vectorId = `qa-${messageId}`

  if (event) {
    await upsertVector(event, vectorId, embedding, {
      type: 'qa_pair',
      id: messageId,
      title: userMsg.content.slice(0, 100),
      category: 'learned',
    })
  } else {
    await upsertVector(vectorId, embedding, {
      type: 'qa_pair',
      id: messageId,
      title: userMsg.content.slice(0, 100),
      category: 'learned',
    })
  }

  await execute(`
    INSERT INTO ai_embeddings_log (entity_type, entity_id, vector_id, content_hash)
    VALUES ('qa_pair', $1, $2, $3)
    ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET vector_id = EXCLUDED.vector_id,
        content_hash = EXCLUDED.content_hash,
        created_at = NOW()
  `, [messageId, vectorId, contentHash])
}

/**
 * Batch embed all knowledge articles that don't have embeddings yet.
 * Processes in batches of 10.
 */
export async function batchEmbedArticles(event?: H3Event): Promise<{ processed: number; errors: number }> {
  const articles = await queryRows<any>(`
    SELECT a.id
    FROM ai_knowledge_articles a
    LEFT JOIN ai_embeddings_log e ON e.entity_type = 'knowledge_article' AND e.entity_id = a.id
    WHERE a.is_published = true
      AND e.id IS NULL
    ORDER BY a.created_at DESC
    LIMIT 50
  `)

  let processed = 0
  let errors = 0

  // Process in batches of 10
  for (let i = 0; i < articles.length; i += 10) {
    const batch = articles.slice(i, i + 10)
    const results = await Promise.allSettled(
      batch.map(a => event ? embedKnowledgeArticle(event, a.id) : embedKnowledgeArticle(a.id))
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        processed++
      } else {
        errors++
        console.error('[embeddingPipeline] Batch embed error:', result.reason)
      }
    }
  }

  return { processed, errors }
}
