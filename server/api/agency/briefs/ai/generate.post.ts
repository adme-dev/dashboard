/**
 * AI-powered brief generation — fills all fields from a natural language prompt
 */

import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { templateId, clientId, prompt: userPrompt, existingValues } = body

  if (!templateId || !userPrompt?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'templateId and prompt are required' })
  }

  try {
    // Get template with fields
    const template = await queryOne(`
      SELECT id, name, description
      FROM brief_templates
      WHERE id = $1 AND is_active = true
    `, [templateId])

    if (!template) {
      throw createError({ statusCode: 404, statusMessage: 'Template not found' })
    }

    const fields = await queryRows(`
      SELECT field_key, field_label, field_type, placeholder, help_text,
             is_required, options, validation_rules
      FROM brief_template_fields
      WHERE template_id = $1
        AND field_type NOT IN ('heading', 'paragraph', 'divider')
      ORDER BY step_number, sort_order
    `, [templateId])

    if (fields.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Template has no fields' })
    }

    // Client context
    let clientContext = ''
    if (clientId) {
      const client = await queryOne(
        'SELECT name, industry, website FROM agency_clients WHERE id = $1',
        [clientId]
      )
      if (client) {
        clientContext = `\nClient: ${client.name}${client.industry ? ` (Industry: ${client.industry})` : ''}${client.website ? ` (Website: ${client.website})` : ''}`
      }

      // Past briefs for pattern
      const pastBriefs = await queryRows(`
        SELECT b.title, b.status
        FROM briefs b
        WHERE b.client_id = $1 AND b.template_id = $2
        ORDER BY b.created_at DESC
        LIMIT 3
      `, [clientId, templateId])

      if (pastBriefs.length > 0) {
        clientContext += `\nRecent briefs for this client with same template: ${pastBriefs.map(b => b.title).join(', ')}`
      }
    }

    // Build field definitions for the AI
    const fieldDefs = fields.map(f => {
      let def = `- "${f.field_key}" (${f.field_label}): type=${f.field_type}`
      if (f.is_required) def += ', REQUIRED'
      if (f.help_text) def += `, hint: ${f.help_text}`
      if (f.placeholder) def += `, placeholder: ${f.placeholder}`
      if (f.options) {
        const opts = typeof f.options === 'string' ? JSON.parse(f.options) : f.options
        if (Array.isArray(opts) && opts.length > 0) {
          def += `, options: [${opts.map((o: any) => o.value || o.label).join(', ')}]`
        }
      }
      if (f.validation_rules) {
        const rules = typeof f.validation_rules === 'string' ? JSON.parse(f.validation_rules) : f.validation_rules
        if (rules.minLength) def += `, minLength: ${rules.minLength}`
        if (rules.maxLength) def += `, maxLength: ${rules.maxLength}`
      }
      return def
    }).join('\n')

    // Existing values context
    let existingContext = ''
    if (existingValues && typeof existingValues === 'object') {
      const entries = Object.entries(existingValues)
        .filter(([_, v]) => v !== null && v !== undefined && v !== '')
      if (entries.length > 0) {
        existingContext = `\nAlready filled values (do NOT overwrite these):\n${entries.map(([k, v]) => `- ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n')}`
      }
    }

    const aiPrompt = `You are an AI assistant for a digital marketing agency. Generate field values for a brief submission.

Template: "${template.name}"
${template.description ? `Description: ${template.description}` : ''}
${clientContext}

Field definitions:
${fieldDefs}
${existingContext}

User's request: "${userPrompt.trim()}"

Generate appropriate values for ALL fields listed above. For dropdown/radio fields, use ONLY values from the provided options list. For text fields, be professional and detailed. For date fields, use ISO format (YYYY-MM-DD).

Also generate a concise title for the brief.

Respond with valid JSON:
{
  "title": "Brief title here",
  "generatedValues": {
    "field_key_1": "value1",
    "field_key_2": "value2"
  },
  "confidence": 0.8,
  "warnings": ["any warnings about uncertain fields"]
}`

    const systemPrompt = 'You are a professional brief writer for a digital marketing agency. Generate high-quality, contextually relevant content. Respond only with valid JSON. No markdown or explanations.'

    let result: any = null

    // Use Groq for generation (needs larger context)
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
            model: 'llama-3.1-70b-versatile',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: aiPrompt }
            ],
            max_tokens: 2000,
            temperature: 0.5
          })
        })

        if (groqResponse.ok) {
          const data = await groqResponse.json() as any
          const content = data.choices?.[0]?.message?.content || ''
          const cleaned = content.replace(/```json\n?|\n?```/g, '').trim()
          result = JSON.parse(cleaned)
        }
      } catch (err) {
        console.error('[AI Generate] Groq failed:', err)
      }
    }

    // Fallback to edge AI (may produce lower quality for complex templates)
    if (!result) {
      const { edgeGenerate } = await import('~~/server/utils/edgeAi')
      const edgeResult = await edgeGenerate(event, aiPrompt, {
        systemPrompt,
        maxTokens: 1500,
        temperature: 0.5
      })

      if (edgeResult) {
        try {
          const cleaned = edgeResult.replace(/```json\n?|\n?```/g, '').trim()
          result = JSON.parse(cleaned)
        } catch {
          // Edge AI response wasn't valid JSON
        }
      }
    }

    if (!result || !result.generatedValues) {
      throw createError({
        statusCode: 502,
        statusMessage: 'AI generation failed. Please try again or fill in the form manually.'
      })
    }

    // Validate generated values against field types
    const warnings: string[] = result.warnings || []
    const generatedValues: Record<string, any> = {}

    for (const field of fields) {
      const value = result.generatedValues[field.field_key]
      if (value === undefined || value === null) continue

      // Skip if already filled
      if (existingValues?.[field.field_key] !== undefined && existingValues[field.field_key] !== null && existingValues[field.field_key] !== '') {
        continue
      }

      // Basic type validation
      if (field.field_type === 'dropdown' || field.field_type === 'radio') {
        const opts = typeof field.options === 'string' ? JSON.parse(field.options) : (field.options || [])
        const validValues = opts.map((o: any) => o.value || o.label)
        if (!validValues.includes(value)) {
          warnings.push(`"${field.field_label}": AI suggested "${value}" which may not be a valid option`)
        }
      }

      generatedValues[field.field_key] = value
    }

    return {
      generatedValues,
      title: result.title || `${template.name} - ${new Date().toLocaleDateString()}`,
      confidence: typeof result.confidence === 'number' ? Math.max(0, Math.min(1, result.confidence)) : 0.7,
      warnings
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to generate brief:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to generate brief with AI' })
  }
})
