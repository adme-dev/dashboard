import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/pages/agency/social/publishing/news.vue', 'utf8')

describe('social news client content profile UI', () => {
  it('uses labelled, full-width controls for profile and approved guidance fields', () => {
    for (const label of [
      'Industry',
      'Target audience',
      'Content pillars',
      'Preferred platforms',
      'Guidance title',
      'Approved guidance'
    ]) {
      expect(page).toContain(`label="${label}"`)
    }

    expect(page).toContain('v-model="evidenceForm.content" :rows="4" class="w-full"')
    expect(page).toContain('class="flex justify-end"')
  })

  it('keeps the raw Slack importer secondary to the review workflow', () => {
    expect(page).toContain('<details')
    expect(page).toContain('Import a Slack JSON export')
    expect(page).toContain('v-model="slackImportText" :rows="5" class="w-full font-mono text-xs"')
  })

  it('renders a compact pending-evidence empty state', () => {
    expect(page).toContain('No evidence awaiting review')
    expect(page).toContain('i-lucide-inbox')
    expect(page).not.toContain('border-dashed border-default px-4 py-5')
  })
})
