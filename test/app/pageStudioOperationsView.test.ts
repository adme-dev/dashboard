import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

describe('Page Studio operations usage visibility', () => {
  it('renders server-owned allowance warnings before limits are exhausted', () => {
    const view = readFileSync(resolve(root, 'app/components/page-studio/OperationsView.vue'), 'utf8')

    expect(view).toContain('const usageAlerts = computed')
    expect(view).toContain('check.used / check.limit < 0.8')
    expect(view).toContain('Review the plan before creating more.')
    expect(view).toContain('v-for="alert in usageAlerts"')
  })
})
