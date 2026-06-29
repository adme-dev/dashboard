import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const clientPageSource = readFileSync(
  new URL('../../app/pages/agency/analytics/client/[id].vue', import.meta.url),
  'utf8',
)
const agencyLayoutSource = readFileSync(
  new URL('../../app/layouts/agency.vue', import.meta.url),
  'utf8',
)

describe('client analytics layout', () => {
  it('uses the agency content body as the single scroll surface', () => {
    expect(clientPageSource).toContain('class="w-full p-4 sm:p-6 space-y-6"')
    expect(clientPageSource).not.toContain('class="h-full min-h-0 w-full overflow-y-auto')
    expect(agencyLayoutSource).toContain('isClientAnalyticsRoute')
    expect(agencyLayoutSource).toContain("'overflow-y-auto'")
  })
})
