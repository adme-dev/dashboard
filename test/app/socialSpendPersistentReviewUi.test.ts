import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const table = readFileSync(new URL('../../app/components/social/SpendVarianceTable.vue', import.meta.url), 'utf8')
const page = readFileSync(new URL('../../app/components/social/SpendDashboard.client.vue', import.meta.url), 'utf8')
const aiAnalysisEndpoint = readFileSync(new URL('../../server/api/agency/social/spend/[id]/ai-analysis.post.ts', import.meta.url), 'utf8')
const featureIndex = readFileSync(new URL('../../app/pages/features/index.vue', import.meta.url), 'utf8')
const featureDetail = readFileSync(new URL('../../app/pages/features/[slug].vue', import.meta.url), 'utf8')

describe('social spend persistent campaign review UI', () => {
  it('renders Review from the complete campaign review list rather than pacing notices only', () => {
    expect(table).toContain('campaignReviewItems?: PacingReviewItem[]')
    expect(table).toContain('campaignReviewsForItem(item)')
    expect(table).toContain('No pacing issue')
    expect(table).not.toContain('<span v-else class="text-muted">-</span>\n          </td>\n          <!-- Pacing cell -->')
  })

  it('passes all campaign review records to the variance table', () => {
    expect(page).toContain('const campaignReviewItems = computed(() => pacingReview.value?.campaigns ?? pacingReview.value?.items ?? [])')
    expect(page).toContain(':campaign-review-items="campaignReviewItems"')
  })

  it('allows a healthy campaign to request AI insights from its neutral review record', () => {
    expect(aiAnalysisEndpoint).toContain('review.campaigns.find(i => i.issueType === requestedIssue)')
    expect(aiAnalysisEndpoint).toContain('review.campaigns[0]')
    expect(aiAnalysisEndpoint).not.toContain('Campaign is not currently flagged for pacing review')
  })

  it('documents that campaign review remains available without an active alert', () => {
    expect(featureIndex).toContain('keeps campaign review available for every synced Meta and Google campaign')
    expect(featureDetail).toContain('Every synced campaign keeps a Review entry point even when it is pacing normally')
    expect(featureDetail).toContain('whether or not a pacing alert is active')
  })

  it('renders AI risk flags at a readable size with wrapping', () => {
    const historyPanel = readFileSync(new URL('../../app/components/social/SpendCampaignHistorySlideover.vue', import.meta.url), 'utf8')
    expect(historyPanel).toContain('class="whitespace-normal text-left text-xs leading-5 font-medium"')
    expect(historyPanel).toContain('class="mt-3 flex flex-wrap gap-2"')
  })
})
