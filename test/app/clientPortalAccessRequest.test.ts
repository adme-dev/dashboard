import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('agency client portal access request', () => {
  it('sends one stable idempotency key with the portal access mutation and preserves the failure toast', () => {
    const page = readFileSync('app/pages/agency/client-portal.vue', 'utf8')

    expect(page).toMatch(/apiFetch\('\/api\/agency\/client-portal\/access',[\s\S]*body:\s*\{\s*clientId:\s*targetClientId\s*\}/)
    expect(page).toContain('headers: { \'Idempotency-Key\': `portal-access:${crypto.randomUUID()}` }')
    expect(page).toContain('title: \'Failed to open portal\'')
    expect(page).toContain('description: errorMessage(err)')
    expect(page).toContain('color: \'error\'')
  })
})
