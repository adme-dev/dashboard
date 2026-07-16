import { describe, expect, it } from 'vitest'
import { normalizeMcpNewsItem } from '~~/server/utils/socialNews'

describe('MCP news inbox contract', () => {
  it('accepts the common MCP item shape used by ingestion', () => {
    expect(normalizeMcpNewsItem({ externalId: 'x', title: 'Story', url: 'https://example.test' })).toMatchObject({ externalId: 'x' })
  })
})
