import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = () => readFileSync(
  'app/components/analytics/audiences/intelligence/CandidateReviewSlideover.vue',
  'utf8'
)

describe('agency candidate review contract', () => {
  it('gates all decisions through current validation and the governed fixed crawl preview', () => {
    const review = source()

    expect(review).toMatch(/USlideover/)
    expect(review).toMatch(/@container/)
    expect(review).toMatch(/UFormField[\s\S]*Reviewer reason[\s\S]*UTextarea/)
    expect(review).toMatch(/UFormField[\s\S]*Manual website[\s\S]*UInput/)
    expect(review).toMatch(/canonicalOrigin/)
    expect(review).toMatch(/existingDomainId/)
    expect(review).toMatch(/validation is current|current validation/i)
    expect(review).toMatch(/Competitor/)
    expect(review).toMatch(/25 pages/)
    expect(review).toMatch(/Depth 1/)
    expect(review).toMatch(/Automatic rendering/)
    expect(review).toMatch(/Manual frequency/)
    expect(review).toMatch(/30-day raw retention/)
    expect(review).toMatch(/Search purpose/)
    expect(review).toMatch(/AI input off/)
    expect(review).toMatch(/Exact origin/)
    expect(review).toMatch(/No subdomains/)
    expect(review).toMatch(/Approve & index/)
    expect(review).toMatch(/Save for later/)
    expect(review).toMatch(/Dismiss/)
    expect(review).toMatch(/:disabled="!canApprove"/)
  })

  it('routes an approved crawl-start failure to retry and diagnostics without repeating approval', () => {
    const review = source()

    expect(review).toMatch(/crawlStart/)
    expect(review).toMatch(/approved/i)
    expect(review).toMatch(/Retry crawl/)
    expect(review).toMatch(/View diagnostics/)
    expect(review).toMatch(/v-if="crawlStartFailed"[\s\S]*Retry crawl/)
    expect(review).toMatch(/v-else[\s\S]*:label="approvalLabel"/)
    expect(review.match(/label="Retry crawl"/g)).toHaveLength(1)
    expect(review).toMatch(/template v-if="crawlStartFailed"[\s\S]*Retry crawl[\s\S]*View diagnostics[\s\S]*template v-else[\s\S]*Save for later[\s\S]*Dismiss[\s\S]*approvalLabel/)
  })

  it('allows an existing monitored domain to be linked to the reviewed candidate', () => {
    const review = source()

    expect(review).toMatch(/approvalLabel/)
    expect(review).toMatch(/Link monitored domain/)
    expect(review).toMatch(/existingDomainId[\s\S]*already monitored[\s\S]*link/i)
    expect(review).not.toMatch(/&&\s*!props\.review\?\.existingDomainId/)
    expect(review).toMatch(/:label="approvalLabel"/)
  })
})
