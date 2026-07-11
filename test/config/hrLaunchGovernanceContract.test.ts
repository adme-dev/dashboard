import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const getRoute = readFileSync('server/api/agency/hr/governance/launch-readiness.get.ts', 'utf8')
const postRoute = readFileSync('server/api/agency/hr/governance/launch-attestations.post.ts', 'utf8')
const commissionRoute = readFileSync('server/api/agency/hr/reviews/index.post.ts', 'utf8')

describe('HR launch governance contract', () => {
  it('restricts readiness and attestations to HR owners and disables caching', () => {
    for (const source of [getRoute, postRoute]) {
      expect(source).toContain('requireHrAdmin(event)')
      expect(source).toContain("'Cache-Control', 'private, no-store'")
    }
  })

  it('appends validated human attestations and audits them', () => {
    expect(postRoute).toContain('hrLaunchAttestationSchema.safeParse')
    expect(postRoute).toContain('INSERT INTO hr_launch_gate_attestations')
    expect(postRoute).not.toContain('UPDATE hr_launch_gate_attestations')
    expect(postRoute).toContain("action: 'launch_gate.attested'")
  })

  it('returns current readiness and the bounded append-only approval ledger', () => {
    expect(getRoute).toContain('SELECT DISTINCT ON (gate_key)')
    expect(getRoute).toContain('ORDER BY created_at DESC')
    expect(getRoute).toContain('LIMIT 500')
  })

  it('fails questionnaire commissioning closed until every gate is current', () => {
    expect(commissionRoute).toContain('evaluateHrLaunchReadiness')
    expect(commissionRoute).toContain('hr_launch_gate_attestations')
    expect(commissionRoute).toContain('HR launch governance gates are incomplete or expired')
  })
})
