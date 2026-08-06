import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createClientPortalAccessRequest } from '../../app/utils/clientPortalAccessRequest'

describe('agency client portal access request', () => {
  it('sends one stable idempotency key with the portal access mutation and preserves the failure toast', () => {
    const page = readFileSync('app/pages/agency/client-portal.vue', 'utf8')

    expect(page).toContain('import { createClientPortalAccessRequest } from \'~/utils/clientPortalAccessRequest\'')
    expect(page).toMatch(/apiFetch\('\/api\/agency\/client-portal\/access',\s*createClientPortalAccessRequest\(targetClientId\)\)/)
    expect(page).toContain('title: \'Failed to open portal\'')
    expect(page).toContain('description: errorMessage(err)')
    expect(page).toContain('color: \'error\'')
  })

  it('builds one bounded request identity per explicit portal-open action', () => {
    const request = createClientPortalAccessRequest(
      '33333333-3333-4333-8333-333333333333',
      () => '77777777-7777-4777-8777-777777777777'
    )

    expect(request).toEqual({
      method: 'POST',
      body: { clientId: '33333333-3333-4333-8333-333333333333' },
      headers: {
        'Idempotency-Key': 'portal-access:77777777-7777-4777-8777-777777777777'
      }
    })
    expect(request.headers['Idempotency-Key']).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/)
  })
})
