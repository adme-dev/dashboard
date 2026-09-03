import { describe, expect, it } from 'vitest'
import { registry } from '~~/server/utils/ai/tools'
import { projectGodModeTools } from '~~/server/utils/ai/mcp/registry'
import { googleAdsSearchPlanningTools } from '~~/server/utils/ai/mcp/googleAdsSearchTools'
import { toMcpInputSchema } from '~~/server/utils/ai/mcp/project'
import { z } from 'zod'

// Regression guard for the 2026-09-03 outage: google_ads_plan_create_asset (a discriminated union)
// rendered as a bare `oneOf` with no top-level `type: "object"`. MCP hosts validate every entry of
// tools/list and reject the WHOLE manifest on one bad schema, hiding all 169 tools. The catalog
// count guard cannot catch this — shape must be asserted directly.
const allSuiteFlags = new Proxy({}, { get: () => true }) as never

describe('MCP catalog inputSchema shape', () => {
  it('every god-mode tool declares a top-level object inputSchema', () => {
    const tools = projectGodModeTools({
      tools: registry as never,
      role: 'owner',
      scopes: ['mcp:read', 'mcp:write'],
      requireWriteScope: false,
      suiteFlags: allSuiteFlags,
      governanceBypass: true
    })
    expect(tools.length).toBeGreaterThan(0)
    const offenders = tools
      .map((tool, index) => ({ index, name: tool.name, type: (tool.inputSchema as { type?: unknown })?.type }))
      .filter(entry => entry.type !== 'object')
    expect(offenders).toEqual([])
  })

  it('lifts a discriminated-union schema under an explicit object wrapper', () => {
    const union = z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('a'), x: z.string() }),
      z.strictObject({ kind: z.literal('b'), y: z.number() })
    ])
    const json = toMcpInputSchema(union)
    expect(json.type).toBe('object')
    expect(Array.isArray(json.oneOf)).toBe(true)
    // plain objects pass through untouched
    const plain = toMcpInputSchema(z.strictObject({ x: z.string() }))
    expect(plain.type).toBe('object')
    expect(plain.oneOf).toBeUndefined()
    // the registry reconstructs Zod from the manifest — the wrapper must still validate variants
    const rebuilt = z.fromJSONSchema(json as never)
    expect(rebuilt.safeParse({ kind: 'a', x: 'hi' }).success).toBe(true)
    expect(rebuilt.safeParse({ kind: 'b', y: 1 }).success).toBe(true)
    expect(rebuilt.safeParse({ kind: 'a', y: 1 }).success).toBe(false)
  })

  it('google_ads_plan_create_asset manifest is object-typed', () => {
    const tool = googleAdsSearchPlanningTools.find(t => t.name === 'google_ads_plan_create_asset')
    expect(tool?.inputSchema.type).toBe('object')
  })
})
