import { describe, expect, it } from 'vitest'
import { normalizeMcpNewsItem } from '~~/server/utils/socialNews'

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
})
