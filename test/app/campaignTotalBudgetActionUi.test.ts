import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const history = readFileSync(new URL('../../app/components/social/SpendCampaignHistorySlideover.vue', import.meta.url), 'utf8')
const pacing = readFileSync(new URL('../../app/components/social/SpendPacingReview.vue', import.meta.url), 'utf8')

describe('campaign-total budget action UI', () => {
  it('labels a custom-period daily figure as a benchmark and removes daily write controls', () => {
    expect(pacing).toContain(`item.dailyBudgetActionSupported ? 'New/day' : 'Pace needed/day'`)
    expect(history).toContain('Campaign-total budget · daily write unavailable')
    expect(history).toContain(`canApplyLive && dailyBudgetActionSupported && action.actionStatus === 'approved'`)
    expect(history).toContain('v-if="dailyBudgetActionSupported"')
  })
})
