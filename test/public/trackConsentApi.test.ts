import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('public tracking consent API', () => {
  const source = readFileSync(resolve(__dirname, '../../public/track.js'), 'utf8')

  it('exposes explicit person-level consent controls with policy evidence', () => {
    expect(source).toMatch(/window\.XeroFlowConsent\.get = getConsent/)
    expect(source).toMatch(/window\.XeroFlowConsent\.set = setConsent/)
    expect(source).toMatch(/policyVersion/)
    expect(source).toMatch(/noticeUrl/)
    expect(source).toMatch(/decisionMethod/)
  })

  it('always permits consent updates to reach the ledger', () => {
    expect(source).toMatch(/'consent_update'/)
    expect(source).toMatch(/track\('consent_update'/)
  })
})
