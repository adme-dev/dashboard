import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const fullWidthRoots = [
  'app/pages/portal/index.vue',
  'app/pages/portal/features.vue',
  'app/pages/portal/invoices.vue',
  'app/pages/portal/meetings.vue',
  'app/pages/portal/notifications.vue',
  'app/pages/portal/settings.vue',
  'app/pages/portal/crm.vue',
  'app/pages/portal/leads.vue',
  'app/pages/portal/social-inbox.vue',
  'app/pages/portal/social-listening.vue',
  'app/pages/portal/social-reporting.vue',
]

describe('portal content width', () => {
  it('makes the shared authenticated content region full width', () => {
    const layout = readFileSync('app/layouts/portal.vue', 'utf8')
    expect(layout).toContain('class="flex-1 w-full min-w-0')
  })

  it.each(fullWidthRoots)('%s has a full-width page root', (file) => {
    const source = readFileSync(file, 'utf8')
    const template = source.slice(source.indexOf('<template>'))
    const rootClass = template.match(/<(?:div|UDashboardPanel)[^>]*class="([^"]*)"/)?.[1]

    expect(rootClass).toContain('w-full')
    expect(rootClass).not.toMatch(/\bmax-w-/)
  })

  it('does not cap the measurement page body width', () => {
    const source = readFileSync('app/pages/portal/measurement.vue', 'utf8')
    expect(source).not.toContain('mx-auto w-full max-w-6xl')
    expect(source).toContain('class="w-full space-y-6 p-4 sm:p-6 lg:p-8"')
  })
})
