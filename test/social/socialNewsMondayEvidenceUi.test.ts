import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Monday client evidence review UI', () => {
  it('surfaces preview, import, and review actions in the client content profile', () => {
    const page = readFileSync('app/pages/agency/social/publishing/news.vue', 'utf8')
    expect(page).toContain('/evidence/imports/monday/preview')
    expect(page).toContain('/evidence/imports/monday`')
    expect(page).toContain('?reviewStatus=pending')
    expect(page).toContain("reviewStatus: 'approved'")
    expect(page).toContain("reviewStatus: 'rejected'")
    expect(page).toContain('Pending evidence review')
  })
})
