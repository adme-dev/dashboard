import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('social news discoverability', () => {
  it('directs Auto Feed users to the separate aggregated News Inbox workflow', () => {
    const page = readFileSync('app/pages/agency/social/publishing/feed.vue', 'utf8')

    expect(page).toContain('Dealer inventory feed items')
    expect(page).toContain('Looking for industry news?')
    expect(page).toContain('Auto Feed is dealer inventory only')
    expect(page).toContain('Browse News Inbox')
    expect(page).toContain('to="/agency/social/publishing/news"')
  })
})
