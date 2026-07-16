import { describe, expect, it } from 'vitest'
import { normalizeMcpNewsItem } from '~~/server/utils/socialNews'
import { isSafeNewsSourceUrl, sourceFromRow } from '~~/server/utils/socialNewsSources'

describe('normalizeMcpNewsItem', () => {
  it('normalizes MCP link fields and preserves the raw source', () => {
    const item = normalizeMcpNewsItem({ id: 'n-1', title: '  Headline  ', description: 'Summary', link: 'https://example.com/a' })
    expect(item).toMatchObject({ externalId: 'n-1', title: 'Headline', summary: 'Summary', url: 'https://example.com/a' })
    expect(item?.raw).toMatchObject({ id: 'n-1' })
  })

  it('rejects items without a stable id or title', () => {
    expect(normalizeMcpNewsItem({ title: 'No identity' })).toBeNull()
    expect(normalizeMcpNewsItem({ id: 'n-2' })).toBeNull()
  })

  it('treats the news feed as a configurable HTTPS plug-in', () => {
    expect(isSafeNewsSourceUrl('https://example.test/mcp')).toBe(true)
    expect(isSafeNewsSourceUrl('http://example.test/mcp')).toBe(false)
    expect(sourceFromRow({ source_key: 'mcp_news', display_name: 'MCP News', endpoint_url: 'https://example.test', enabled: true, settings: {} }).sourceKey).toBe('mcp_news')
  })
})
