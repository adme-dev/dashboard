import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)

function source(path: string) {
  return readFileSync(new URL(path, root), 'utf8')
}

describe('persona agency access contracts', () => {
  it('uses dynamic media-buying permission for sensitive reads', () => {
    for (const path of [
      'server/api/agency/analytics/personas/activations.get.ts',
      'server/api/agency/analytics/personas/cohorts.get.ts'
    ]) {
      const file = source(path)
      expect(file).toContain('requirePersonaReadAccess')
      expect(file).not.toContain('requireAuth')
    }
  })

  it('uses dynamic admin permission for activation and reconciliation operations', () => {
    for (const path of [
      'server/api/agency/analytics/personas/activations.post.ts',
      'server/api/agency/analytics/personas/activations/[id].patch.ts',
      'server/api/agency/analytics/personas/reconciliation.get.ts',
      'server/api/agency/analytics/personas/reconciliation.post.ts',
      'server/api/agency/analytics/personas/reconciliation/[id].patch.ts'
    ]) {
      const file = source(path)
      expect(file).toContain('requirePersonaAdminAccess')
      expect(file).not.toContain("['owner', 'admin']")
      expect(file).not.toContain('requireAuth')
    }
  })

  it('maps access through dynamic permission groups', () => {
    const access = source('server/utils/persona/access.ts')
    expect(access).toContain("requirePermission(event, 'MEDIA_BUYING')")
    expect(access).toContain("requirePermission(event, 'ADMIN')")
  })
})
