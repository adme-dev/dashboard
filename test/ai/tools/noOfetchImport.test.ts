import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Regression guard for the CF-Pages internal-fetch bug.
 *
 * AI tool handlers make internal calls to relative routes (e.g. '/api/xero/...').
 * On the Cloudflare Pages/Workers runtime, raw `import { $fetch } from 'ofetch'`
 * THROWS on a relative URL — it has no origin base. The tool's try/catch then
 * swallows it and the assistant reports "the finance system isn't responding".
 *
 * The correct pattern is Nitro's auto-imported global `$fetch`, which resolves
 * internal relative routes (see confirm-action.post.ts). So: no tool may import
 * `$fetch` from 'ofetch'. Use the bare global instead.
 */
const toolsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'server', 'utils', 'ai', 'tools')

describe('AI tools: no raw ofetch import (CF internal-fetch guard)', () => {
  const files = readdirSync(toolsDir).filter(f => f.endsWith('.ts'))

  it('finds the tool source files', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  for (const file of readdirSync(toolsDir).filter(f => f.endsWith('.ts'))) {
    it(`${file} does not import $fetch from 'ofetch'`, () => {
      const src = readFileSync(join(toolsDir, file), 'utf8')
      expect(src).not.toMatch(/from\s+['"]ofetch['"]/)
    })
  }
})
