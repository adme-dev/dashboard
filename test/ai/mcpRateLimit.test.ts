import { describe, it, expect } from 'vitest'
import {
  isGenerationRateLimited,
  isInspectionRateLimited,
  MCP_GEN_RATE_MAX,
  MCP_INSPECTION_RATE_MAX,
} from '~~/server/utils/ai/mcp/rateLimit'

describe('isGenerationRateLimited', () => {
  it('allows when under the cap', () => {
    expect(isGenerationRateLimited(0)).toBe(false)
    expect(isGenerationRateLimited(MCP_GEN_RATE_MAX - 1)).toBe(false)
  })

  it('refuses at and above the cap', () => {
    expect(isGenerationRateLimited(MCP_GEN_RATE_MAX)).toBe(true)
    expect(isGenerationRateLimited(MCP_GEN_RATE_MAX + 5)).toBe(true)
  })

  it('honours a custom max', () => {
    expect(isGenerationRateLimited(3, 3)).toBe(true)
    expect(isGenerationRateLimited(2, 3)).toBe(false)
  })
})

describe('MCP inspection rate limit', () => {
  it('uses a separate, more generous inspection ceiling', () => {
    expect(MCP_INSPECTION_RATE_MAX).toBeGreaterThan(MCP_GEN_RATE_MAX)
    expect(isInspectionRateLimited(MCP_INSPECTION_RATE_MAX - 1)).toBe(false)
    expect(isInspectionRateLimited(MCP_INSPECTION_RATE_MAX)).toBe(true)
  })
})
