import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../../../app/pages/agency/hr/monday/import.vue', import.meta.url), 'utf8')
const scopePage = readFileSync(new URL('../../../app/pages/agency/hr/monday/index.vue', import.meta.url), 'utf8')
const evidencePage = readFileSync(new URL('../../../app/pages/agency/hr/monday/evidence.vue', import.meta.url), 'utf8')

describe('HR Monday governed sync UI', () => {
  it('uses sibling routes so nested pages render instead of being swallowed by a parent page', () => {
    expect(existsSync('app/pages/agency/hr/monday.vue')).toBe(false)
    expect(existsSync('app/pages/agency/hr/monday/index.vue')).toBe(true)
  })

  it('uses the governed incremental sync endpoint and exposes durable checkpoints', () => {
    expect(page).toContain("'/api/agency/hr/monday/sync'")
    expect(page).toContain("'/api/agency/hr/monday/sync-status'")
    expect(page).toContain('Board checkpoints')
    expect(page).toContain('lastCompletedAt')
    expect(page).not.toContain("'/api/agency/hr/monday/import'")
  })

  it('discloses the automatic schedule and sensitive-content exclusions', () => {
    expect(page).toContain('Approved boards reconcile hourly')
    expect(page).toContain('Signed webhook events are processed every five minutes')
    expect(page).toContain('Comments and files remain excluded')
  })

  it('keeps every HR Monday content page independently scrollable', () => {
    for (const source of [scopePage, evidencePage, page]) {
      expect(source).toContain('<main class="h-full min-h-0 overflow-y-auto bg-default">')
    }
  })
})
