import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('board Files public feature copy', () => {
  it('keeps the feature index, detail page, and navigation in sync', () => {
    const index = readFileSync('app/pages/features/index.vue', 'utf8')
    const detail = readFileSync('app/pages/features/[slug].vue', 'utf8')
    const nav = readFileSync('app/components/MarketingNav.vue', 'utf8')

    expect(index).toContain('searchable board-wide file library')
    expect(detail).toContain('Six Connected Views and a File Library')
    expect(detail).toContain('task attachments remain attached to their source task')
    expect(nav).toContain("subtitle: 'Six views and a board file library'")
  })
})
