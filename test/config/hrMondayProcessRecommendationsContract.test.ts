import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const getRoute = readFileSync('server/api/agency/hr/monday/recommendations.get.ts', 'utf8')
const postRoute = readFileSync('server/api/agency/hr/monday/recommendations.post.ts', 'utf8')

describe('HR Monday process recommendation contract', () => {
  it('keeps suggestions owner-only, no-store, scoped and read-only until explicit save', () => {
    expect(getRoute).toContain('requireHrAdmin(event)')
    expect(getRoute).toContain("'Cache-Control', 'private, no-store'")
    expect(getRoute).toContain('getActiveMondayEvidenceScope')
    expect(getRoute).toContain('Nothing is approved')
  })

  it('recomputes the selected candidate and saves only a draft in private HR knowledge', () => {
    expect(postRoute).toContain('loadMondayProcessSummaries(scope)')
    expect(postRoute).toContain("VALUES ($1, $2, $3, 'draft', $4)")
    expect(postRoute).toContain('ON CONFLICT (entry_key) DO NOTHING')
    expect(postRoute).toContain("'restricted_hr'")
    expect(postRoute).toContain('general_ai_excluded')
    expect(postRoute).toContain('automaticConclusion: false')
    expect(postRoute).not.toContain("status: 'approved'")
  })
})
