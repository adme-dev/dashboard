import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('server/database/migrations/245_hr_benchmark_registry.sql', 'utf8')
const list = readFileSync('server/api/agency/hr/benchmarks/index.get.ts', 'utf8')
const create = readFileSync('server/api/agency/hr/benchmarks/index.post.ts', 'utf8')
const activate = readFileSync('server/api/agency/hr/benchmarks/[id]/activate.post.ts', 'utf8')
const page = readFileSync('app/pages/agency/hr/benchmarks.vue', 'utf8')

describe('HR benchmark framework registry', () => {
  it('stores licence, role-family, level, criteria and review metadata', () => {
    for (const field of ['license_terms', 'role_families', 'levels', 'review_due_at']) expect(migration).toContain(field)
  })

  it('creates drafts and requires explicit owner activation', () => {
    expect(create).toContain("'draft'")
    expect(create).not.toContain("'active'")
    expect(activate).toContain('requireHrAdmin(event)')
    expect(activate).toContain("SET status = 'retired'")
    expect(activate).toContain("status = 'active'")
    expect(activate).toContain("action: 'benchmark_framework.activated'")
  })

  it('lists retired versions for reproducibility and labels draft frameworks as unusable', () => {
    expect(list).toContain("ORDER BY framework.framework_key, framework.created_at DESC")
    expect(page).toContain('Benchmark framework registry')
    expect(page).toContain('Draft frameworks cannot be assigned to roles')
  })
})
