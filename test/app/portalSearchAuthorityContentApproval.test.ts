import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/pages/portal/search-authority/content/[id].vue', 'utf8')

describe('portal Search Authority content approval', () => {
  it('shows only review-safe version evidence and explicit decisions', () => {
    expect(page).toContain('Proposed guide')
    expect(page).toContain('Source labels')
    expect(page).toContain('Claims to verify')
    expect(page).toContain('Approve version')
    expect(page).toContain('Request changes')
    expect(page).not.toMatch(/raw quer|provider id|access_token|score:/i)
  })
})
