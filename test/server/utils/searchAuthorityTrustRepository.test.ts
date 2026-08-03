import { describe, expect, it, vi } from 'vitest'

import { reconcileSearchAuthorityTrustFindings } from '~~/server/utils/searchAuthority/trustRepository'

const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
const DOMAIN_ID = '22222222-2222-4222-8222-222222222222'
const PAGE_ID = '44444444-4444-4444-8444-444444444444'
const RUN_ID = '11111111-1111-4111-8111-111111111111'

describe('search authority trust finding reconciliation', () => {
  it('upserts deterministic findings and resolves absent checks after a complete observation', async () => {
    const query = vi.fn(async () => ({ rows: [] }))

    await reconcileSearchAuthorityTrustFindings(query, {
      clientId: CLIENT_ID,
      domainId: DOMAIN_ID,
      pageId: PAGE_ID,
      runId: RUN_ID,
      canonicalUrl: 'https://dealer.example.com/vehicles/h6',
      observationComplete: true,
      findings: [{
        checkKey: 'canonical.missing',
        severity: 'medium',
        owner: 'dealer_origin',
        title: 'Canonical URL is missing',
        summary: 'The rendered HTML does not declare a canonical URL.',
        evidence: { pageUrl: 'https://dealer.example.com/vehicles/h6' }
      }]
    })

    const upsert = query.mock.calls.find(call => String(call[0]).includes('INSERT INTO search_authority_trust_findings'))
    const resolve = query.mock.calls.find(call => String(call[0]).includes(`lifecycle_status = 'resolved'`))
    expect(upsert?.[1]?.[4]).toMatch(/^[a-f0-9]{64}$/)
    expect(resolve?.[1]?.[4]).toEqual([upsert?.[1]?.[4]])
  })

  it('does not auto-resolve findings after an incomplete observation', async () => {
    const query = vi.fn(async () => ({ rows: [] }))

    await reconcileSearchAuthorityTrustFindings(query, {
      clientId: CLIENT_ID,
      domainId: DOMAIN_ID,
      pageId: PAGE_ID,
      runId: RUN_ID,
      canonicalUrl: 'https://dealer.example.com/vehicles/h6',
      observationComplete: false,
      findings: []
    })

    expect(query).not.toHaveBeenCalled()
  })
})
