/** Release marker returned by the exact Pages projection and forwarded by the MCP transport. */
export const MCP_CATALOG_RELEASE = '2026-09-01.15'
export const MCP_PREVIOUS_CATALOG_RELEASE = '2026-08-28.14'
export const MCP_MIN_TOOL_COUNT = 164
export const MCP_SERVER_VERSION = '1.0.4'

export function compareMcpCatalogReleases(left: string, right: string): number {
  const parse = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})\.(\d+)$/.exec(value)
    return match ? match.slice(1).map(Number) : null
  }
  const a = parse(left)
  const b = parse(right)
  if (!a || !b) return left.localeCompare(right)
  for (let index = 0; index < a.length; index++) {
    const delta = a[index]! - b[index]!
    if (delta !== 0) return delta
  }
  return 0
}

export function assertMcpCatalogNotRegressed(release: string, toolCount: number): void {
  if (compareMcpCatalogReleases(release, MCP_CATALOG_RELEASE) < 0 || toolCount < MCP_MIN_TOOL_COUNT) {
    throw new Error(`MCP catalog regression: ${release} with ${toolCount} tools`)
  }
}
