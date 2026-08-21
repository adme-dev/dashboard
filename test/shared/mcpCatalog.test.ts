import { describe, expect, it } from 'vitest'
import { assertMcpCatalogNotRegressed, compareMcpCatalogReleases } from '~~/shared/utils/mcpCatalog'

describe('MCP catalog rollback guard', () => {
  it('compares numeric release sequence values rather than lexicographic strings', () => {
    expect(compareMcpCatalogReleases('2026-08-21.12', '2026-08-21.9')).toBeGreaterThan(0)
    expect(compareMcpCatalogReleases('2026-08-20.99', '2026-08-21.1')).toBeLessThan(0)
  })

  it('rejects a release or tool-count regression', () => {
    expect(() => assertMcpCatalogNotRegressed('2026-08-20.10', 85)).toThrow('MCP catalog regression')
    expect(() => assertMcpCatalogNotRegressed('2026-08-21.12', 75)).toThrow('MCP catalog regression')
    expect(() => assertMcpCatalogNotRegressed('2026-08-21.12', 85)).not.toThrow()
  })
})
