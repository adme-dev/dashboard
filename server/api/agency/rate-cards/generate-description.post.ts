import { requireAuth } from '~~/server/utils/auth'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const { serviceName, categoryName, price, priceUnit, setupFee, setupNotes, notes } = body

  if (!serviceName) {
    throw createError({ statusCode: 400, statusMessage: 'Service name is required' })
  }

  // 1. Research via Perplexity for real-world context
  const webResearch = await fetchPerplexityResearch(serviceName, categoryName || 'General')

  const priceDisplay = priceUnit === 'POA'
    ? 'Price on application'
    : `$${Number(price || 0).toFixed(2)} ${priceUnit || ''}`

  // 2. Generate description with Groq using research context
  const prompt = `Write a professional service description for a digital marketing agency rate card.

Service: ${serviceName}
Category: ${categoryName || 'General'}
Pricing: ${priceDisplay}
${setupFee ? `Setup Fee: $${Number(setupFee).toFixed(2)}` : ''}
${setupNotes ? `Setup Notes: ${setupNotes}` : ''}
${notes ? `Context: ${notes}` : ''}

${webResearch ? `Industry research for context (use to inform the description but do not copy verbatim):\n${webResearch}\n` : ''}
Write 2-3 paragraphs describing what this service includes, typical deliverables, and scope. Write in second person ("you'll receive", "your campaign"). Be specific to digital marketing. Do not include pricing in the description. Do not use markdown — write plain text with line breaks between paragraphs.`

  const description = await generateGroqInsight(prompt, {
    model: GROQ_MODELS.LLAMA_70B,
    temperature: 0.4,
    maxTokens: 600,
    systemPrompt: 'You are a digital marketing agency copywriter. Write clear, professional service descriptions for rate cards. Be concise and specific. Output plain text only — no markdown, no bullet points, no headers.',
  })

  return { description }
})

/**
 * Fetch real-time research from Perplexity about the service type.
 * Returns null gracefully if unavailable.
 */
async function fetchPerplexityResearch(serviceName: string, categoryName: string): Promise<string | null> {
  const config = useRuntimeConfig()
  const apiKey = config.perplexityApiKey || process.env.PERPLEXITY_API_KEY
  if (!apiKey) return null

  const aiGatewayUrl = config.aiGatewayUrl || process.env.AI_GATEWAY_URL
  const baseUrl = aiGatewayUrl
    ? `${aiGatewayUrl.replace(/\/+$/, '')}/perplexity-ai`
    : 'https://api.perplexity.ai'

  try {
    const response = await $fetch<any>(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a digital marketing industry researcher. Provide concise factual information about marketing services, what they typically include, industry-standard deliverables, and best practices. Focus on Australian market context. Keep responses under 300 words.',
          },
          {
            role: 'user',
            content: `Research what a "${serviceName}" service typically includes at a digital marketing agency (category: ${categoryName}). What are the standard deliverables, scope, and what should clients expect? Include any relevant Australian industry standards or benchmarks.`,
          },
        ],
        max_tokens: 500,
        temperature: 0.1,
      },
      signal: AbortSignal.timeout(8000),
    })

    const content = response?.choices?.[0]?.message?.content
    return (content && content.length > 50) ? content : null
  } catch (err) {
    console.warn('[rate-card] Perplexity research failed (non-critical):', (err as Error).message)
    return null
  }
}
