import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const createRoute = readFileSync(new URL('../../server/api/agency/hr/roles/index.post.ts', import.meta.url), 'utf8')
const reviseRoute = readFileSync(new URL('../../server/api/agency/hr/roles/[id]/versions.post.ts', import.meta.url), 'utf8')
const listRoute = readFileSync(new URL('../../server/api/agency/hr/roles/index.get.ts', import.meta.url), 'utf8')

describe('HR role source-reference API contract', () => {
  it('persists validated source metadata alongside any approved contract extract', () => {
    for (const route of [createRoute, reviseRoute]) {
      expect(route).toContain('input.sourceReferences')
      expect(route).toContain('roleSourceReferences')
      expect(route).toContain('sourceReferenceCount')
    }
  })

  it('returns source references with the immutable role version', () => {
    expect(listRoute).toContain('rpv.source_refs')
  })
})
