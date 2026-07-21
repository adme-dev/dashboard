import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/pages/agency/ai/my-assistant.vue', 'utf8')

describe('My Assistant explainability UI', () => {
  it('keeps existing personal controls and exposes current server-derived authority', () => {
    expect(page).toContain('Default focus')
    expect(page).toContain('Remember helpful details about you')
    expect(page).toContain('What I’ve learned from your work')
    expect(page).toContain('Tools')
    expect(page).toContain('Your access')
    expect(page).toContain('Department scope')
    expect(page).toContain('Client scope')
    expect(page).toContain('Capability packs')
    expect(page).toContain('pack.releaseState === \'pilot\'')
    expect(page).toContain('assigned to you as a pilot')
    expect(page).toContain('Why something may be unavailable')
  })

  it('states that settings only narrow authority and renders accessible status text', () => {
    expect(page).toContain('never grant access')
    expect(page).toContain('aria-live="polite"')
    expect(page).toContain('restriction.message')
    expect(page).toContain('escalationManagerName')
    expect(page).toContain('pack.version')
  })
})
