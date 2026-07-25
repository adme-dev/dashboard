import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)
const source = (path: string) => readFileSync(new URL(path, root), 'utf8')
const routes = ['summary', 'timeseries', 'funnel', 'breakdown', 'health', 'insights']

describe('portal tracking analytics routes', () => {
  it('implements every route requested by the portal tracking dashboard', () => {
    for (const route of routes) {
      expect(existsSync(new URL(`server/api/portal/analytics/tracking/${route}.get.ts`, root))).toBe(true)
    }
  })

  it('derives tenant scope from the client session and enforces analytics access', () => {
    for (const route of routes) {
      const endpoint = source(`server/api/portal/analytics/tracking/${route}.get.ts`)
      expect(endpoint).toContain('requireClientAuth(event)')
      expect(endpoint).toContain('permissions.canViewAnalytics')
      expect(endpoint).not.toContain('getRouterParam')
      expect(endpoint).not.toContain('requireClientTrackingAccess')
    }
  })

  it('keeps all first-party queries inside bounded client-local date windows', () => {
    for (const route of ['summary', 'timeseries', 'funnel', 'breakdown', 'insights']) {
      const endpoint = source(`server/api/portal/analytics/tracking/${route}.get.ts`)
      expect(endpoint).toContain('parsePortalTrackingRange(event)')
      expect(endpoint).toContain('resolveClientTimezone(client.clientId)')
      expect(endpoint).toContain('client_id = $1')
      expect(endpoint).toContain('WINDOW_SQL')
      expect(endpoint).toContain('NOISE_SQL')
    }
  })
})
