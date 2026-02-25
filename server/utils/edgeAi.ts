import type { H3Event } from 'h3'

/**
 * Workers AI edge inference — lightweight AI at the edge (<50ms).
 * Uses @cf/meta/llama-3.1-8b-instruct for fast classification/generation.
 * All functions return null when the AI binding is unavailable (local dev, no Cloudflare).
 */

function getAI(event: H3Event): any | null {
  try {
    return (event.context as any).cloudflare?.env?.AI ?? null
  } catch {
    return null
  }
}

/**
 * Generate text using Workers AI at the edge.
 * Returns null if binding unavailable or on error.
 */
export async function edgeGenerate(
  event: H3Event,
  prompt: string,
  options: { systemPrompt?: string; maxTokens?: number; temperature?: number } = {}
): Promise<string | null> {
  const ai = getAI(event)
  if (!ai) return null

  try {
    const messages: Array<{ role: string; content: string }> = []
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }
    messages.push({ role: 'user', content: prompt })

    const result = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages,
      max_tokens: options.maxTokens ?? 256,
      temperature: options.temperature ?? 0.3,
    })

    return result?.response ?? null
  } catch (err) {
    console.error('[edgeAi] Generation failed:', err)
    return null
  }
}

/**
 * Classify text into one of the given categories using Workers AI.
 * Returns null if binding unavailable or on error.
 */
export async function edgeClassify(
  event: H3Event,
  text: string,
  categories: string[]
): Promise<{ category: string; confidence: number } | null> {
  const ai = getAI(event)
  if (!ai) return null

  try {
    const categoryList = categories.map((c, i) => `${i + 1}. ${c}`).join('\n')
    const prompt = `Classify the following text into exactly ONE of these categories. Respond with ONLY valid JSON in format {"category":"<name>","confidence":<0.0-1.0>}.\n\nCategories:\n${categoryList}\n\nText: "${text}"`

    const result = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'You are a text classifier. Respond only with valid JSON. No explanations.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 100,
      temperature: 0.1,
    })

    const response = result?.response
    if (!response) return null

    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    if (!parsed.category || !categories.includes(parsed.category)) {
      return null
    }

    return {
      category: parsed.category,
      confidence: typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.7,
    }
  } catch (err) {
    console.error('[edgeAi] Classification failed:', err)
    return null
  }
}

/**
 * Generate text using Workers AI with an optional LoRA adapter.
 * Tries the fast model with LoRA first, falls back to base model on failure.
 * Returns null if binding unavailable.
 */
export async function edgeGenerateWithLoRA(
  event: H3Event,
  prompt: string,
  options: {
    systemPrompt?: string
    maxTokens?: number
    temperature?: number
    loraAdapter?: { id: string; name: string } | null
  } = {}
): Promise<{ response: string | null; usedLora: boolean; adapterId: string | null }> {
  const ai = getAI(event)
  if (!ai) return { response: null, usedLora: false, adapterId: null }

  const messages: Array<{ role: string; content: string }> = []
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt })
  }
  messages.push({ role: 'user', content: prompt })

  const baseParams = {
    messages,
    max_tokens: options.maxTokens ?? 256,
    temperature: options.temperature ?? 0.3,
  }

  // Try LoRA adapter first if provided
  if (options.loraAdapter) {
    try {
      const result = await ai.run('@cf/meta/llama-3.1-8b-instruct-fast', {
        ...baseParams,
        lora: options.loraAdapter.name,
      })
      if (result?.response) {
        return { response: result.response, usedLora: true, adapterId: options.loraAdapter.id }
      }
    } catch (err) {
      console.warn('[edgeAi] LoRA generation failed, falling back to base model:', err)
    }
  }

  // Fall back to base model
  try {
    const result = await ai.run('@cf/meta/llama-3.1-8b-instruct', baseParams)
    return { response: result?.response ?? null, usedLora: false, adapterId: null }
  } catch (err) {
    console.error('[edgeAi] Base generation failed:', err)
    return { response: null, usedLora: false, adapterId: null }
  }
}

/**
 * Summarize text using Workers AI at the edge.
 * Returns null if binding unavailable or on error.
 */
export async function edgeSummarize(
  event: H3Event,
  text: string,
  maxLength: number = 200
): Promise<string | null> {
  return edgeGenerate(event, `Summarize the following text in ${maxLength} characters or less. Be concise and factual.\n\nText: "${text}"`, {
    systemPrompt: 'You are a text summarizer. Provide concise summaries only.',
    maxTokens: Math.ceil(maxLength / 3),
    temperature: 0.2,
  })
}
