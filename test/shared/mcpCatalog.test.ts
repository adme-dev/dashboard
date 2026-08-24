import { describe, expect, it } from 'vitest'
import {
  MCP_CATALOG_RELEASE,
  MCP_MIN_TOOL_COUNT,
  MCP_PREVIOUS_CATALOG_RELEASE,
  MCP_SERVER_VERSION,
  assertMcpCatalogNotRegressed,
  compareMcpCatalogReleases,
} from '~~/shared/utils/mcpCatalog'

describe('MCP catalog rollback guard', () => {
  it('compares numeric release sequence values rather than lexicographic strings', () => {
    expect(compareMcpCatalogReleases('2026-08-21.12', '2026-08-21.9')).toBeGreaterThan(0)
    expect(compareMcpCatalogReleases('2026-08-20.99', '2026-08-21.1')).toBeLessThan(0)
  })

  it('rejects a release or tool-count regression', () => {
    expect(MCP_CATALOG_RELEASE).toBe('2026-08-24.13')
    expect(MCP_PREVIOUS_CATALOG_RELEASE).toBe('2026-08-21.12')
    expect(MCP_SERVER_VERSION).toBe('1.0.3')
    expect(MCP_MIN_TOOL_COUNT).toBe(86)
    expect(() => assertMcpCatalogNotRegressed('2026-08-21.12', 86)).toThrow('MCP catalog regression')
    expect(() => assertMcpCatalogNotRegressed('2026-08-24.13', 85)).toThrow('MCP catalog regression')
    expect(() => assertMcpCatalogNotRegressed('2026-08-24.13', 86)).not.toThrow()
  })
})
