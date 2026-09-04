import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('portal measurement signal-health projection', () => {
  it('shows aggregate funnel and freshness evidence without rendering identifier fields', () => {
    const page = readFileSync('app/pages/portal/measurement.vue', 'utf8')

    expect(page).toContain('Website visits')
    expect(page).toContain('Confirmed leads')
    expect(page).toContain('Last signal collected')
    expect(page).toContain('Last provider delivery')
    expect(page).not.toMatch(/health\.(?:ttclid|ttp|fbc|fbp|gclid)|credentialRef|accessToken/)
  })
})
