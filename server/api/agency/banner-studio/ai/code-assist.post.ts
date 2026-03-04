/**
 * AI Code Assistant for Custom HTML Banners
 * POST /api/agency/banner-studio/ai/code-assist
 * Body: { html, css, js, width, height, prompt, history?, action?, templateName?, templateCategory?, variables? }
 * Returns: { reply, codeBlocks, model }
 */

import { requireAuth } from '~~/server/utils/auth'
import { edgeGenerate } from '~~/server/utils/edgeAi'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'

interface CodeBlock {
  language: 'html' | 'css' | 'javascript' | 'unknown'
  code: string
  description?: string
}

interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `You are an expert HTML/CSS/JavaScript banner ad developer. You help users write, modify, and debug custom banner ad code.

Rules:
- Always use fenced code blocks with language tags (\`\`\`html, \`\`\`css, \`\`\`javascript)
- When modifying code, show the COMPLETE updated code (not diffs or partial snippets)
- Keep explanations brief and focused — banner devs want code, not essays
- Banner ads must be self-contained (inline styles OK, no external dependencies unless CDN-hosted)
- Consider the banner dimensions when suggesting layouts
- Use CSS animations/transitions for motion — avoid heavy JS animation libs unless asked
- Ensure click-through URLs work (the container should be clickable)
- Optimize for small file size and fast load times`

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const {
    html, css, js,
    width, height,
    prompt, history,
    action, templateName, templateCategory, variables,
  } = body as {
    html?: string
    css?: string
    js?: string
    width?: number
    height?: number
    prompt: string
    history?: HistoryMessage[]
    action?: string
    templateName?: string
    templateCategory?: string
    variables?: { name: string; label: string; type: string }[]
  }

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'prompt is required' })
  }

  // Build context block (truncated to fit model limits)
  const contextParts: string[] = []

  if (width && height) {
    contextParts.push(`Banner dimensions: ${width}x${height}`)
  }
  if (templateName) {
    contextParts.push(`Template: ${templateName}${templateCategory ? ` (${templateCategory})` : ''}`)
  }
  if (variables && variables.length > 0) {
    const varList = variables.map(v => `  {{${v.name}}} (${v.type}): ${v.label}`).join('\n')
    contextParts.push(`Template variables:\n${varList}`)
  }
  if (html) {
    contextParts.push(`Current HTML:\n\`\`\`html\n${truncate(html, 6000)}\n\`\`\``)
  }
  if (css) {
    contextParts.push(`Current CSS:\n\`\`\`css\n${truncate(css, 4000)}\n\`\`\``)
  }
  if (js) {
    contextParts.push(`Current JS:\n\`\`\`javascript\n${truncate(js, 4000)}\n\`\`\``)
  }

  const contextBlock = contextParts.length > 0
    ? `\n\nCurrent banner code context:\n${contextParts.join('\n\n')}`
    : ''

  const actionHint = action && action !== 'general'
    ? `\n\n[Action type: ${action}]`
    : ''

  const userPrompt = `${prompt}${actionHint}${contextBlock}`

  // Build conversation history for multi-turn (last 6 messages max)
  const recentHistory = (history || []).slice(-6)

  let reply = ''
  let model = 'fallback'

  // Try Workers AI first
  try {
    const historyPrompt = recentHistory.length > 0
      ? recentHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${truncate(m.content, 1000)}`).join('\n\n') + '\n\nUser: '
      : ''

    const fullPrompt = historyPrompt + userPrompt

    const aiResult = await edgeGenerate(event, fullPrompt, {
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 2000,
      temperature: 0.4,
    })

    if (aiResult && aiResult.trim().length > 20) {
      reply = aiResult
      model = 'workers-ai'
    }
  } catch {
    // Fall through to Groq
  }

  // Fallback to Groq (70B for better code generation)
  if (!reply) {
    try {
      const groqResult = await generateGroqInsight(userPrompt, {
        model: GROQ_MODELS.LLAMA_70B,
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 2000,
        temperature: 0.4,
      })
      if (groqResult && groqResult.trim().length > 10) {
        reply = groqResult
        model = 'groq'
      }
    } catch {
      // Both failed
    }
  }

  // Heuristic fallback
  if (!reply) {
    reply = generateFallbackReply(prompt, action)
    model = 'fallback'
  }

  // Extract code blocks from reply
  const codeBlocks = extractCodeBlocks(reply)

  return { reply, codeBlocks, model }
})

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max) + '\n... (truncated)'
}

function extractCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const regex = /```(\w+)?\s*\n([\s\S]*?)```/g
  let match

  while ((match = regex.exec(text)) !== null) {
    const lang = (match[1] || '').toLowerCase()
    const code = match[2].trim()
    if (!code) continue

    let language: CodeBlock['language'] = 'unknown'
    if (lang === 'html' || lang === 'htm') language = 'html'
    else if (lang === 'css' || lang === 'scss') language = 'css'
    else if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') language = 'javascript'

    // Try to infer a description from surrounding text
    const beforeBlock = text.slice(0, match.index)
    const lastLine = beforeBlock.trim().split('\n').pop()?.trim()
    const description = lastLine && lastLine.length < 120 && !lastLine.startsWith('```')
      ? lastLine.replace(/^[#*-]+\s*/, '')
      : undefined

    blocks.push({ language, code, description })
  }

  return blocks
}

function generateFallbackReply(prompt: string, action?: string): string {
  const lower = prompt.toLowerCase()

  if (action === 'animate' || lower.includes('animat')) {
    return `Here's a simple CSS animation you can add:

\`\`\`css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.banner-content {
  animation: fadeIn 0.6s ease-out forwards;
}
\`\`\`

Add the \`banner-content\` class to the elements you want to animate, then adjust the timing and transform values to fit your design.`
  }

  if (action === 'fix' || lower.includes('bug') || lower.includes('fix')) {
    return 'I couldn\'t connect to the AI service right now. To debug your banner code:\n\n1. Check the browser console for errors\n2. Verify all CSS selectors match your HTML elements\n3. Ensure JavaScript targets existing DOM elements\n4. Check for unclosed tags or missing semicolons'
  }

  return 'I\'m having trouble connecting to the AI service right now. Please try again in a moment, or describe your request differently.'
}
