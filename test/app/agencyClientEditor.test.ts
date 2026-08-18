import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('agency client editor', () => {
  const page = readFileSync('app/pages/agency/clients/[id].vue', 'utf8')
  const xeroContactSearch = readFileSync('app/components/XeroContactSearch.vue', 'utf8')

  it('uses responsive Nuxt UI form grids without duplicate model bindings', () => {
    expect(page).toContain('<form class="@container px-1 space-y-6"')
    expect(page).toContain('grid grid-cols-1 gap-4 @lg:grid-cols-2')
    expect(page.match(/v-model\.number="editForm\.hourlyRate"/g)).toHaveLength(1)
  })

  it('supplies stable idempotency keys to both coordinated save requests', () => {
    expect(page).toContain("headers: { 'Idempotency-Key': idempotencyKeyFor('client', clientPayload) }")
    expect(page).toContain("headers: { 'Idempotency-Key': idempotencyKeyFor('crm', crmPayload) }")
  })

  it('checks Xero connection status before requesting contacts', () => {
    expect(xeroContactSearch).toContain("contactFetch<XeroStatus>('/api/xero/status')")
    expect(xeroContactSearch).toContain('if (!status.connected)')
    expect(xeroContactSearch).toContain('<UAlert')
  })
})
