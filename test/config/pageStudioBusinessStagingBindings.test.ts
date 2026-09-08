import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'
import { PageStudioContentScopeSchema } from '../../shared/pageStudio/businessContent'

interface Config {
  services?: Array<{ binding: string, service: string, entrypoint?: string }>
  vars?: Record<string, string>
  env?: { preview: Config, production: Config }
}
const config = parse(readFileSync('wrangler.toml', 'utf8')) as Config

describe('Page Studio private staging connections', () => {
  it('maps each synthetic site to its own content and named booking service', () => {
    const preview = config.env!.preview
    expect(preview.vars?.PAGE_STUDIO_CONTENT_ENVIRONMENT).toBe('staging')
    expect(preview.vars?.PAGE_STUDIO_BOOKING_ENVIRONMENT).toBe('staging')
    const content = JSON.parse(preview.vars!.PAGE_STUDIO_CONTENT_BINDINGS!)
    const bookings = JSON.parse(preview.vars!.PAGE_STUDIO_BOOKING_BINDINGS!)
    expect(content).toHaveLength(2)
    expect(bookings).toHaveLength(2)
    for (const [index, label] of ['a', 'b'].entries()) {
      const suffix = String(101 + index)
      const scope = PageStudioContentScopeSchema.parse({
        tenantId: 'tenant_page_studio_staging',
        clientId: `20000000-0000-4000-8000-000000000${suffix}`,
        businessId: `business_staging_${label}`,
        siteId: `50000000-0000-4000-8000-000000000${suffix}`,
        environment: 'staging'
      })
      const contentBinding = `PAGE_STUDIO_CONTENT_${label.toUpperCase()}`
      const bookingBinding = `PAGE_STUDIO_BOOKINGS_${label.toUpperCase()}`
      expect(content).toContainEqual({ scope, bindingName: contentBinding })
      expect(bookings).toContainEqual({ scope, bindingName: bookingBinding, entrypoint: 'ScopedBookingsEntrypoint' })
      expect(preview.services).toContainEqual({ binding: contentBinding, service: `xeroflow-business-content-staging-${label}` })
      expect(preview.services).toContainEqual({ binding: bookingBinding, service: `xeroflow-business-content-staging-${label}`, entrypoint: 'ScopedBookingsEntrypoint' })
      for (const name of [contentBinding, bookingBinding]) {
        expect(preview.services!.filter(service => service.binding === name)).toHaveLength(1)
      }
    }
  })

  it('does not expose staging business data through production or inherited bindings', () => {
    for (const environment of [config, config.env!.production]) {
      expect(environment.services?.some(service => service.service.startsWith('xeroflow-business-content-')) ?? false).toBe(false)
      expect(environment.vars?.PAGE_STUDIO_CONTENT_BINDINGS).toBeUndefined()
      expect(environment.vars?.PAGE_STUDIO_BOOKING_BINDINGS).toBeUndefined()
    }
  })
})
