import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { embedAiQAPair } from '~~/server/utils/aiEmbeddingPipeline'
import { searchSimilar } from '~~/server/utils/aiVectorize'
import type { AiLearnedPattern } from '~/types'

/**
 * Process user feedback on an AI message.
 * - Thumbs up: queue the Q&A pair for embedding as a learned pattern
 * - Thumbs down with correction: create a correction pattern for future retrieval
 */
export async function processFeedback(
  messageId: string,
  userId: string,
  rating: -1 | 1,
  correction?: string,
  category?: string
): Promise<void> {
  // Save or update feedback
  await execute(`
    INSERT INTO ai_feedback (message_id, user_id, rating, correction, category)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (message_id, user_id) DO UPDATE
    SET rating = EXCLUDED.rating,
        correction = EXCLUDED.correction,
        category = EXCLUDED.category,
        created_at = NOW()
  `, [messageId, userId, rating, correction || null, category || null])

  // Get the feedback row ID for pattern linking
  const feedback = await queryOne<any>(`
    SELECT id FROM ai_feedback WHERE message_id = $1 AND user_id = $2
  `, [messageId, userId])

  const feedbackId = feedback?.id

  if (rating === 1) {
    // Positive feedback: learn from this Q&A pair
    await handlePositiveFeedback(messageId, feedbackId)
  } else if (rating === -1 && correction) {
    // Negative feedback with correction: store as correction pattern
    await handleNegativeFeedback(messageId, userId, feedbackId, correction, category)
  }
}

async function handlePositiveFeedback(messageId: string, feedbackId: string): Promise<void> {
  // Get the assistant message and its preceding user message
  const assistantMsg = await queryOne<any>(`
    SELECT id, conversation_id, content, created_at
    FROM ai_messages
    WHERE id = $1 AND role = 'assistant'
  `, [messageId])

  if (!assistantMsg) return

  const userMsg = await queryOne<any>(`
    SELECT content
    FROM ai_messages
    WHERE conversation_id = $1
      AND role = 'user'
      AND created_at < $2
    ORDER BY created_at DESC
    LIMIT 1
  `, [assistantMsg.conversation_id, assistantMsg.created_at])

  if (!userMsg) return

  const subject = userMsg.content.slice(0, 200)

  // Check if a similar pattern already exists
  const existingPattern = await queryOne<any>(`
    SELECT id, confidence, source_count, source_feedback_ids
    FROM ai_learned_patterns
    WHERE pattern_type = 'positive_qa'
      AND subject ILIKE $1
      AND is_active = true
    LIMIT 1
  `, [`%${subject.slice(0, 50)}%`])

  if (existingPattern) {
    // Increment confidence and source count
    const newConfidence = Math.min(1.0, Number(existingPattern.confidence) + 0.1)
    const feedbackIds = existingPattern.source_feedback_ids || []
    if (feedbackId && !feedbackIds.includes(feedbackId)) {
      feedbackIds.push(feedbackId)
    }

    await execute(`
      UPDATE ai_learned_patterns
      SET confidence = $2,
          source_count = source_count + 1,
          source_feedback_ids = $3,
          updated_at = NOW()
      WHERE id = $1
    `, [existingPattern.id, newConfidence, feedbackIds])
  } else {
    // Create new learned pattern
    await execute(`
      INSERT INTO ai_learned_patterns (pattern_type, subject, content, confidence, source_feedback_ids)
      VALUES ('positive_qa', $1, $2, 0.6, $3)
    `, [
      subject,
      assistantMsg.content,
      feedbackId ? [feedbackId] : [],
    ])
  }

  // Queue the Q&A pair for embedding (fire-and-forget)
  embedAiQAPair(messageId).catch(err => {
    console.error('[feedback] Failed to embed Q&A pair:', err)
  })
}

async function handleNegativeFeedback(
  messageId: string,
  userId: string,
  feedbackId: string,
  correction: string,
  category?: string
): Promise<void> {
  // Get the original question for the pattern subject
  const assistantMsg = await queryOne<any>(`
    SELECT conversation_id, created_at
    FROM ai_messages
    WHERE id = $1 AND role = 'assistant'
  `, [messageId])

  if (!assistantMsg) return

  const userMsg = await queryOne<any>(`
    SELECT content
    FROM ai_messages
    WHERE conversation_id = $1
      AND role = 'user'
      AND created_at < $2
    ORDER BY created_at DESC
    LIMIT 1
  `, [assistantMsg.conversation_id, assistantMsg.created_at])

  const subject = userMsg?.content?.slice(0, 200) || 'Unknown question'

  // Create a correction pattern
  await execute(`
    INSERT INTO ai_learned_patterns (pattern_type, subject, content, confidence, source_feedback_ids)
    VALUES ('correction', $1, $2, 0.5, $3)
  `, [
    subject,
    correction,
    feedbackId ? [feedbackId] : [],
  ])
}

/**
 * Retrieve relevant learned patterns for a question.
 * Uses keyword matching and optionally semantic search.
 */
export async function getRelevantPatterns(
  question: string,
  limit: number = 5
): Promise<AiLearnedPattern[]> {
  // Extract keywords for ILIKE search
  const keywords = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 5)

  const patterns: Map<string, AiLearnedPattern> = new Map()

  // Keyword-based search
  if (keywords.length > 0) {
    const pattern = keywords.join('|')
    const rows = await queryRows<any>(`
      SELECT id, pattern_type, subject, content, confidence, source_count,
             source_feedback_ids, embedding_id, is_active, created_at, updated_at
      FROM ai_learned_patterns
      WHERE is_active = true
        AND confidence > 0.3
        AND (subject ~* $1 OR content ~* $1)
      ORDER BY confidence DESC, source_count DESC
      LIMIT $2
    `, [pattern, limit])

    for (const row of rows) {
      patterns.set(row.id, {
        id: row.id,
        patternType: row.pattern_type,
        subject: row.subject,
        content: row.content,
        confidence: Number(row.confidence),
        sourceCount: row.source_count,
        sourceFeedbackIds: row.source_feedback_ids || [],
        embeddingId: row.embedding_id,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
    }
  }

  // Semantic search fallback (if vectorize is available)
  try {
    const semanticResults = await searchSimilar(question, limit)
    for (const match of semanticResults) {
      if (match.metadata?.type === 'qa_pair' && match.score > 0.7 && match.metadata?.id) {
        // Look up the pattern linked to this Q&A pair
        const row = await queryOne<any>(`
          SELECT id, pattern_type, subject, content, confidence, source_count,
                 source_feedback_ids, embedding_id, is_active, created_at, updated_at
          FROM ai_learned_patterns
          WHERE is_active = true
            AND confidence > 0.3
            AND embedding_id = $1
          LIMIT 1
        `, [`qa-${match.metadata.id}`])

        if (row && !patterns.has(row.id)) {
          patterns.set(row.id, {
            id: row.id,
            patternType: row.pattern_type,
            subject: row.subject,
            content: row.content,
            confidence: Number(row.confidence),
            sourceCount: row.source_count,
            sourceFeedbackIds: row.source_feedback_ids || [],
            embeddingId: row.embedding_id,
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })
        }
      }
    }
  } catch {
    // Vectorize not available, keyword results only
  }

  return Array.from(patterns.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit)
}
