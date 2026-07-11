import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const scorecardPut = readFileSync(new URL('../../server/api/agency/hr/reviews/participants/[id]/scorecard.put.ts', import.meta.url), 'utf8')
const kpiGet = readFileSync(new URL('../../server/api/agency/hr/reviews/participants/[id]/kpis.get.ts', import.meta.url), 'utf8')
const kpiPost = readFileSync(new URL('../../server/api/agency/hr/reviews/participants/[id]/kpis.post.ts', import.meta.url), 'utf8')
const kpiPatch = readFileSync(new URL('../../server/api/agency/hr/reviews/participants/[id]/kpis/[observationId].patch.ts', import.meta.url), 'utf8')

describe('HR KPI evidence security contract', () => {
  it('derives KPI scorecard evidence from latest verified observations on the server', () => {
    expect(scorecardPut).toContain("criterion.id === 'role-outcomes-kpis'")
    expect(scorecardPut).toContain("observation.evidence_status = 'verified'")
    expect(scorecardPut).toContain('verifiedKpiCount === activeKpiCount')
    expect(scorecardPut).toContain('kpiEvidenceServerVerified')
  })

  it('keeps evidence role-scoped, auditable and challengeable by the participant', () => {
    for (const route of [kpiGet, kpiPost, kpiPatch]) {
      expect(route).toContain('canAccessHrParticipant')
      expect(route).toContain('recordHrAuditEvent')
      expect(route).toContain("'Cache-Control', 'private, no-store'")
    }
    expect(kpiPost).toContain('KPI does not belong to the participant role version')
    expect(kpiPatch).toContain("parsed.data.evidenceStatus !== 'disputed'")
    expect(kpiPatch).toContain('Participants may dispute evidence but cannot verify it')
  })
})
