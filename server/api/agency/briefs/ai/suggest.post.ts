/**
 * AI field value suggestions for briefs
 */

import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'
import { edgeGenerate } from '~~/server/utils/edgeAi'

// Simple in-memory rate limiter
const rateLimits = new Map<string, number[]>()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 20

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const timestamps = rateLimits.get(userId) || []
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) return false
  recent.push(now)
  rateLimits.set(userId, recent)
  return true
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { templateId, fieldKey, clientId, existingValues, partialValue } = body

  if (!templateId || !fieldKey) {
    throw createError({ statusCode: 400, statusMessage: 'templateId and fieldKey are required' })
  }

  if (!checkRateLimit(user.id)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many AI requests. Please wait a moment.' })
  }

  try {
    // Get field definition
    const field = await queryOne(`
      SELECT id, field_key, field_label, field_type, placeholder, help_text, options
      FROM brief_template_fields
      WHERE template_id = $1 AND field_key = $2
    `, [templateId, fieldKey])

    if (!field) {
      throw createError({ statusCode: 404, statusMessage: 'Field not found' })
    }

    // Get historical values for this field + client combination
    let historyContext = ''
    if (clientId) {
      const history = await queryRows(`
        SELECT bfv.value
        FROM brief_field_values bfv
        JOIN briefs b ON bfv.brief_id = b.id
        JOIN brief_template_fields btf ON bfv.field_id = btf.id
        WHERE btf.template_id = $1
          AND btf.field_key = $2
          AND b.client_id = $3
          AND bfv.value IS NOT NULL
        ORDER BY b.created_at DESC
        LIMIT 5
      `, [templateId, fieldKey, clientId])

      if (history.length > 0) {
        const pastValues = history.map(h => {
          try { return JSON.parse(h.value) } catch { return h.value }
        })
        historyContext = `\nPrevious values used for this client:\n${pastValues.map((v: any) => `- ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n')}`
      }
    }

    // Get client name for context
    let clientName = ''
    if (clientId) {
      const client = await queryOne('SELECT name FROM agency_clients WHERE id = $1', [clientId])
      clientName = client?.name || ''
    }

    // Build existing values context
    let existingContext = ''
    if (existingValues && typeof existingValues === 'object') {
      const entries = Object.entries(existingValues)
        .filter(([_, v]) => v !== null && v !== undefined && v !== '')
        .slice(0, 10)
      if (entries.length > 0) {
        existingContext = `\nOther fields already filled in:\n${entries.map(([k, v]) => `- ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n')}`
      }
    }

    // Options context for dropdown/select fields
    let optionsContext = ''
    if (field.options) {
      const opts = typeof field.options === 'string' ? JSON.parse(field.options) : field.options
      if (Array.isArray(opts) && opts.length > 0) {
        optionsContext = `\nAvailable options: ${opts.map((o: any) => o.label || o.value).join(', ')}`
      }
    }

    const prompt = `You are helping fill in a brief form field.

Field: "${field.field_label}" (${field.field_type})
${field.help_text ? `Description: ${field.help_text}` : ''}
${field.placeholder ? `Placeholder hint: ${field.placeholder}` : ''}
${clientName ? `Client: ${clientName}` : ''}
${optionsContext}
${historyContext}
${existingContext}
${partialValue ? `Current partial value: "${partialValue}"` : ''}

Provide 3 concise, professional suggestions for this field. Each suggestion should be ready to use as-is.
Respond in valid JSON format: {"suggestions": ["suggestion1", "suggestion2", "suggestion3"]}`

    const systemPrompt = 'You are a helpful assistant for a digital marketing agency. Provide professional, contextually relevant suggestions. Respond only with valid JSON.'

    // Try edge AI first
    let suggestions: string[] = []
    let confidence = 0.7

    const edgeResult = await edgeGenerate(event, prompt, {
      systemPrompt,
      maxTokens: 300,
      temperature: 0.6
    })

    if (edgeResult) {
      try {
        const cleaned = edgeResult.replace(/```json\n?|\n?```/g, '').trim()
        const parsed = JSON.parse(cleaned)
        if (Array.isArray(parsed.suggestions)) {
          suggestions = parsed.suggestions.slice(0, 3).map(String)
          confidence = 0.75
        }
      } catch {
        // Parse failed — try Groq fallback
      }
    }

    // Groq fallback if edge AI unavailable or failed
    if (suggestions.length === 0) {
      const config = useRuntimeConfig()
      if (config.groqApiKey) {
        try {
          const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.groqApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'llama-3.1-8b-instant',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
              ],
              max_tokens: 300,
              temperature: 0.6
            })
          })

          if (groqResponse.ok) {
            const data = await groqResponse.json() as any
            const content = data.choices?.[0]?.message?.content || ''
            const cleaned = content.replace(/```json\n?|\n?```/g, '').trim()
            const parsed = JSON.parse(cleaned)
            if (Array.isArray(parsed.suggestions)) {
              suggestions = parsed.suggestions.slice(0, 3).map(String)
              confidence = 0.8
            }
          }
        } catch (err) {
          console.error('[AI Suggest] Groq fallback failed:', err)
        }
      }
    }

    return { suggestions, confidence }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to generate AI suggestions:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to generate suggestions' })
  }
})
