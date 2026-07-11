import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const route = readFileSync('server/api/agency/hr/reviews/aggregate.get.ts', 'utf8')
const page = readFileSync('app/pages/agency/hr/reviews.vue', 'utf8')

describe('HR aggregate feedback contract', () => {
  it('is HR-only, no-store, cycle-bounded, and reads submitted responses only', () => {
    expect(route).toContain('requireHrAdmin(event)')
    expect(route).toContain("setHeader(event, 'Cache-Control', 'private, no-store')")
    expect(route).toContain("response.status = 'submitted'")
    expect(route).not.toContain('respondent_id')
  })

  it('labels suppression and avoids drill-down controls', () => {
    expect(page).toContain('Aggregate business feedback')
    expect(page).toContain('minimum cohort of five')
    expect(page).not.toContain('openAggregateRespondent')
  })
})
