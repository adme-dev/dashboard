/**
 * Export the AI tool registry as OpenAI/Groq-style function definitions for the promptfoo
 * eval harness — generated from the Zod schemas so the evals never drift from the real tools.
 *
 * Run: pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/export-ai-tools.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { z } from 'zod'
import { registry } from '~~/server/utils/ai/tools/index'

const tools = registry.map(t => ({
  type: 'function' as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: z.toJSONSchema((t as any).parameters, { target: 'draft-7' }),
  },
}))

mkdirSync('evals/ai-tools', { recursive: true })
writeFileSync('evals/ai-tools/tools.json', JSON.stringify(tools, null, 2) + '\n')
console.log(`Wrote evals/ai-tools/tools.json (${tools.length} tools: ${tools.map(t => t.function.name).join(', ')})`)
