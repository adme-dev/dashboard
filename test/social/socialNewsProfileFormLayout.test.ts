import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('social news client profile form layout', () => {
  it('keeps multiline fields full-width within the responsive composition grid', () => {
    const page = readFileSync('app/pages/agency/social/publishing/news.vue', 'utf8')

    expect(page.match(/grid grid-cols-1 gap-3 md:grid-cols-2/g)?.length ?? 0).toBeGreaterThanOrEqual(3)

    for (const model of [
      'profileForm.aiInstructions',
      'slackImportText',
      'evidenceForm.content'
    ]) {
      expect(page).toContain(`<UTextarea v-model="${model}" class="w-full col-span-full"`)
    }
  })
})
