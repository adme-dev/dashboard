import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('portal identity reconciliation contract', () => {
  const api = readFileSync(resolve(
    __dirname,
    '../../server/api/portal/analytics/identity-reconciliation.get.ts'
  ), 'utf8')
  const page = readFileSync(resolve(
    __dirname,
    '../../app/pages/portal/analytics/identity.vue'
  ), 'utf8')
  const layout = readFileSync(resolve(__dirname, '../../app/layouts/portal.vue'), 'utf8')

  it('uses authenticated client scope and analytics permissions', () => {
    expect(api).toMatch(/requireClientAuth/)
    expect(api).toMatch(/canViewAnalytics/)
    expect(api).toMatch(/client\.clientId/)
    expect(api).not.toMatch(/getQuery\(event\).*clientId/)
  })

  it('surfaces reconciliation in the portal analytics navigation', () => {
    expect(page).toMatch(/Identity reconciliation/)
    expect(page).toMatch(/Coverage gaps/)
    expect(page).toMatch(/Resolution cases/)
    expect(layout).toMatch(/\/portal\/analytics\/identity/)
  })
})
