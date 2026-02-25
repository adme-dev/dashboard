/**
 * Cloudflare Vectorize bindings for semantic search.
 * Uses Workers AI @cf/baai/bge-base-en-v1.5 (768 dimensions) for embeddings
 * and a Vectorize index for similarity search.
 *
 * All calls are wrapped in try/catch since bindings may not be available in dev.
 */

function getAiBinding(): any | null {
  try {
    // In Cloudflare Workers, bindings are on the global env
    const env = (globalThis as any).__env__
    if (env?.AI) return env.AI

    // Fallback: check process.env bindings (Nitro/Cloudflare Pages)
    const processEnv = (globalThis as any).process?.env
    if (processEnv?.AI) return processEnv.AI

    return null
  } catch {
    return null
  }
}

function getVectorizeBinding(): any | null {
  try {
    const env = (globalThis as any).__env__
    if (env?.VECTORIZE) return env.VECTORIZE

    const processEnv = (globalThis as any).process?.env
    if (processEnv?.VECTORIZE) return processEnv.VECTORIZE

    return null
  } catch {
    return null
  }
}

/**
 * Generate a 768-dimension embedding using Workers AI bge-base-en-v1.5.
 * Returns an empty array if the AI binding is not available.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const ai = getAiBinding()
  if (!ai) {
    console.warn('[aiVectorize] AI binding not available, skipping embedding generation')
    return []
  }

  try {
    // Truncate text to fit model's token limit (~512 tokens ~ 2000 chars)
    const truncated = text.length > 2000 ? text.slice(0, 2000) : text
    const result = await ai.run('@cf/baai/bge-base-en-v1.5', {
      text: [truncated],
    })

    if (result?.data?.[0]) {
      return Array.from(result.data[0])
    }

    return []
  } catch (err) {
    console.error('[aiVectorize] Embedding generation failed:', err)
    return []
  }
}

/**
 * Upsert a vector into the Vectorize index.
 * No-op if the Vectorize binding is not available.
 */
export async function upsertVector(
  id: string,
  values: number[],
  metadata: Record<string, string>
): Promise<void> {
  const vectorize = getVectorizeBinding()
  if (!vectorize) {
    console.warn('[aiVectorize] VECTORIZE binding not available, skipping upsert')
    return
  }

  if (values.length === 0) {
    console.warn('[aiVectorize] Empty embedding values, skipping upsert')
    return
  }

  try {
    await vectorize.upsert([{
      id,
      values,
      metadata,
    }])
  } catch (err) {
    console.error('[aiVectorize] Vector upsert failed:', err)
  }
}

/**
 * Search for similar vectors in the Vectorize index.
 * Returns empty results if the binding or embedding generation is unavailable.
 */
export async function searchSimilar(
  query: string,
  topK: number = 5
): Promise<Array<{ id: string; score: number; metadata: Record<string, string> }>> {
  const vectorize = getVectorizeBinding()
  if (!vectorize) {
    return []
  }

  try {
    const queryEmbedding = await generateEmbedding(query)
    if (queryEmbedding.length === 0) {
      return []
    }

    const result = await vectorize.query(queryEmbedding, {
      topK,
      returnMetadata: true,
    })

    if (!result?.matches) {
      return []
    }

    return result.matches.map((match: any) => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata || {},
    }))
  } catch (err) {
    console.error('[aiVectorize] Similarity search failed:', err)
    return []
  }
}

/**
 * Delete a vector from the Vectorize index.
 * No-op if the binding is not available.
 */
export async function deleteVector(id: string): Promise<void> {
  const vectorize = getVectorizeBinding()
  if (!vectorize) {
    return
  }

  try {
    await vectorize.deleteByIds([id])
  } catch (err) {
    console.error('[aiVectorize] Vector deletion failed:', err)
  }
}
