import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const route = readFileSync('server/api/agency/hr/reviews/participants/[id]/structured-evidence.get.ts', 'utf8')
const page = readFileSync('app/pages/agency/hr/reviews/participants/[id].vue', 'utf8')

describe('HR structured evidence adapters', () => {
  it('is object-authorized, no-store, and bounded to the frozen cycle period', () => {
    expect(route).toContain('canAccessHrParticipant')
    expect(route).toContain("setHeader(event, 'Cache-Control', 'private, no-store')")
    expect(route).toContain('cycle.opens_at')
    expect(route).toContain('cycle.closes_at')
  })

  it('links Monday tasks only through approved frozen-role source references', () => {
    expect(route).toContain("source->>'sourceType' = 'monday_item'")
    expect(route).toContain("source->>'sourceId'")
    expect(route).toContain('role_version.source_refs')
  })

  it('returns aggregate workload without descriptions and prohibits performance inference', () => {
    expect(route).toContain('COUNT(DISTINCT entry.project_id)')
    expect(route).not.toContain('entry.description')
    expect(route).toContain('mustNotBeUsedAsPerformanceRating: true')
    expect(page).toContain('Structured operating evidence')
    expect(page).toContain('does not create a performance rating')
  })
})
