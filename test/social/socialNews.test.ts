import { describe, expect, it } from 'vitest'
import { normalizeMcpNewsItem } from '~~/server/utils/socialNews'
import { fetchMcpNewsSource, isSafeNewsSourceUrl, sourceFromRow } from '~~/server/utils/socialNewsSources'

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

  it('extracts news items from an MCP tools/call response', async () => {
    const result = await fetchMcpNewsSource({ sourceKey: 'mcp_news', displayName: 'MCP', endpointUrl: 'https://example.test/mcp', enabled: true, settings: { toolName: 'news' } }, {
      fetchImpl: (async () => new Response(JSON.stringify({ result: { content: [{ type: 'text', text: JSON.stringify({ items: [{ id: '1', title: 'Story' }] }) }] } })) as Response) as typeof fetch,
    })
    expect(result).toEqual([{ id: '1', title: 'Story' }])
  })
})
