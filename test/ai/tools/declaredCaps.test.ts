import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Promise P-03 — "No silent caps, ever." Any AI/MCP tool source that bounds a result (SQL LIMIT,
 * .slice(0, n), LIMIT ${CAP}) must also declare the bound in its response. This is a ratchet, not a
 * proof: it catches a NEW bare cap being added without any declaration token nearby. Files that bound
 * for a reason other than result size are listed with that reason.
 */
const ROOTS = ['server/utils/ai/tools', 'server/utils/ai/mcp']
const CAP_PATTERN = /\bLIMIT\s+(\d+|\$\{)|\.slice\(0,\s*\d+\)/
const DECLARATION_TOKENS = [
  'truncatedAtSource', 'capWithMore', 'paginateWithCursor', 'limit:', 'Limit:', 'Limit,', 'more:', 'More:', 'Cap', 'CAP',
  'ignoredJobIds', 'MaxChars', 'Truncated',
]
const ALLOWLIST: Record<string, string> = {
  'server/utils/ai/tools/clientResolve.ts': 'LIMIT 1 lookups — single-row resolution, not a list',
  'server/utils/ai/tools/capabilities.ts': 'LIMIT $5 is the caller-supplied page size; the action-log tool declares the cap',
  'server/utils/ai/tools/responseContract.ts': 'defines the declaration helpers',
  // Name-resolution candidate lists inside propose tools (LIMIT 6). They feed a `disambiguation`
  // prompt, not a figure; a >6 match set still resolves as "narrow the name". Residual P-03 debt —
  // tracked in the promise register, not hidden.
  'server/utils/ai/tools/createTask.ts': 'disambiguation candidates, LIMIT 6',
  'server/utils/ai/tools/crmActions.ts': 'disambiguation candidates, LIMIT 6',
  'server/utils/ai/tools/deliveryActions.ts': 'disambiguation candidates, LIMIT 6',
  'server/utils/ai/tools/financeActions.ts': 'disambiguation candidates, LIMIT 6',
  'server/utils/ai/tools/proposeBudgetAlert.ts': 'disambiguation candidates, LIMIT 6',
  'server/utils/ai/tools/scheduleSocialPost.ts': 'disambiguation candidates, LIMIT 6',
  // String truncation of ids / error text, not result lists.
  'server/utils/ai/tools/remember.ts': 'truncates a result-reference string, not a list',
  'server/utils/ai/mcp/feedTools.ts': 'truncates an unparseable filter string for display',
  'server/utils/ai/mcp/generationRunner.ts': 'truncates an error message',
  'server/utils/ai/mcp/generationTools.ts': 'truncates an error message',
  'server/utils/ai/mcp/gtmRunner.ts': 'truncates an error message',
  'server/utils/ai/mcp/videoTools.ts': 'truncates an error message',
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : []
  })
}

describe('P-03 declared caps', () => {
  const files = ROOTS.flatMap(root => walk(root))
  const capped = files.filter(file => CAP_PATTERN.test(readFileSync(file, 'utf8')))

  it('finds the tool sources (sanity)', () => {
    expect(files.length).toBeGreaterThan(40)
    expect(capped.length).toBeGreaterThan(10)
  })

  it.each(capped)('%s declares every bound it applies', (file) => {
    if (ALLOWLIST[file]) return
    const source = readFileSync(file, 'utf8')
    // Only lines that cap a LIST matter; LIMIT 1 is a single-row lookup.
    const listCaps = source.split('\n').filter(line => CAP_PATTERN.test(line) && !/\bLIMIT\s+1\b/.test(line))
    if (listCaps.length === 0) return
    const declared = DECLARATION_TOKENS.some(token => source.includes(token))
    expect(declared, `${file} bounds a result (${listCaps[0]!.trim()}) but never declares the bound — add limit/more/truncatedAtSource or allowlist with a reason`).toBe(true)
  })
})
