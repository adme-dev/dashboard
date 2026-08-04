import type { H3Event } from 'h3'

export interface BoardKnowledgeIndexingContext {
  event?: H3Event
}

export interface BoardKnowledgeIndexingPayload {
  submissionId: string
  expectedVersionKey: string
}

/**
 * Queue seam for governed Board Knowledge indexing.
 *
 * Task 9 supplies the dedicated KNOWLEDGE_VECTORIZE implementation. Keeping the
 * seam fail-closed here prevents an approved document from being marked indexed
 * against the shared VECTORIZE binding or before its full chunk set is present.
 */
export async function processBoardKnowledgeIndexing(
  _context: BoardKnowledgeIndexingContext,
  _payload: BoardKnowledgeIndexingPayload
): Promise<never> {
  throw new Error('knowledge_index_processor_not_configured')
}
