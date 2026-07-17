import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/pages/agency/social/publishing/news.vue', 'utf8')

describe('social news client content profile UI', () => {
  it('uses labelled, full-width controls for profile and approved guidance fields', () => {
    for (const label of [
      'Industry',
      'Target audience',
      'Content pillars',
      'Guidance title',
      'Approved guidance'
    ]) {
      expect(page).toContain(`label="${label}"`)
    }

    expect(page).toContain('v-model="evidenceForm.content" class="w-full col-span-full" :rows="4"')
    expect(page).toContain('class="flex justify-end"')
  })

  it('uses semantic fieldsets for checkbox groups so each option keeps its own accessible name', () => {
    expect(page).not.toContain('<UFormField label="Preferred platforms">')
    expect(page).not.toContain('<UFormField label="Platforms">')
    expect(page).not.toContain('<UFormField label="Connected accounts">')
    expect(page.match(/<fieldset/g)).toHaveLength(3)
    expect(page).toContain('>Preferred platforms</legend>')
  })

  it('keeps the raw Slack importer secondary to the review workflow', () => {
    expect(page).toContain('<details')
    expect(page).toContain('Import a Slack JSON export')
    expect(page).toContain('v-model="slackImportText" class="w-full col-span-full" :rows="5"')
  })

  it('renders a compact pending-evidence empty state', () => {
    expect(page).toContain('No evidence awaiting review')
    expect(page).toContain('i-lucide-inbox')
    expect(page).not.toContain('border-dashed border-default px-4 py-5')
  })
})
