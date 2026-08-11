import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const reportsPage = readFileSync('app/pages/agency/reports/index.vue', 'utf8')

describe('agency reports page scrolling', () => {
  it('owns a bounded vertical scroll container inside the clipping agency layout', () => {
    expect(reportsPage).toContain('<div class="flex-1 min-w-0 min-h-0">')
    expect(reportsPage).toContain('<UDashboardPanel :ui="{ root: \'max-h-svh\' }">')
    expect(reportsPage).toContain('<div class="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6">')
  })

  it('renders the summary grid only once', () => {
    expect(
      reportsPage.match(/<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">/g)
    ).toHaveLength(1)
  })
})
