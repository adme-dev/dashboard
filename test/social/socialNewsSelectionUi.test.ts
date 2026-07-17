import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { updateStringSelection } from '~~/app/utils/stringSelection'

describe('social news multi-select controls', () => {
  it('toggles only the requested value without mutating the current selection', () => {
    const current = ['facebook', 'instagram']

    expect(updateStringSelection(current, 'linkedin', true)).toEqual(['facebook', 'instagram', 'linkedin'])
    expect(updateStringSelection(current, 'facebook', false)).toEqual(['instagram'])
    expect(current).toEqual(['facebook', 'instagram'])
  })

  it('does not duplicate a selected value', () => {
    expect(updateStringSelection(['facebook'], 'facebook', true)).toEqual(['facebook'])
  })

  it('does not bind array selections directly to individual Nuxt UI checkboxes', () => {
    const page = readFileSync('app/pages/agency/social/publishing/news.vue', 'utf8')

    for (const model of [
      'profileForm.preferredPlatforms',
      'platforms',
      'accountIds',
      'mondayEvidenceSelected'
    ]) {
      expect(page).not.toMatch(new RegExp(`<UCheckbox[^>]+v-model="${model.replace('.', '\\.')}"`))
    }

    expect(page).toContain('updateStringSelection')
    expect(page).toContain(':model-value="platforms.includes(p)"')
    expect(page).toContain(':model-value="accountIds.includes(a.id)"')
  })

  it('requires an explicit connected-account selection for each client', () => {
    const page = readFileSync('app/pages/agency/social/publishing/news.vue', 'utf8')

    expect(page).not.toContain('accountIds.value = accounts.value.filter(a => a.is_active).map(a => a.id)')
    expect(page).toContain('accountIds.value = []')
  })
})
