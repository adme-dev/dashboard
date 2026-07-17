import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/pages/agency/social/publishing/feed.vue', 'utf8')

describe('Auto Feed client scope and readiness UI', () => {
  it('uses the publishing-suite client as the only client scope', () => {
    expect(page).toContain('useSocialPublishingClient')
    expect(page).toContain('query: { clientId')
    expect(page).not.toContain('const clientFilter = ref(\'all\')')
    expect(page).not.toContain('All clients')
  })

  it('shows provider and source-readiness failures separately from a true empty feed', () => {
    expect(page).toContain('clientSummary?.status === \'error\'')
    expect(page).toContain('clientSummary?.status === \'blocked\'')
    expect(page).toContain('No active dealer feed link')
    expect(page).toContain('No vehicles match this filter')
  })

  it('prevents incomplete vehicles from entering Compose and explains what is missing', () => {
    expect(page).toContain(':disabled="!item.readyForCompose"')
    expect(page).toContain('missingLabel(item.missingFields)')
    expect(page).toContain('Add the missing source data before composing')
  })

  it('requires confirmation before deleting an auto-draft rule', () => {
    expect(page).toContain('deleteTarget')
    expect(page).toContain('Delete auto-draft rule?')
    expect(page).toContain('@click="confirmDeleteRule"')
  })
})
