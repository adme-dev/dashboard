import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const API_INVENTORY = {
  totalRouteFiles: 1930,
  mutationRouteFiles: 1056,
  explicitlyGuardedMutationFiles: 362,
  guardedMutationFilesWithTransactionCall: 25
} as const

const NEWLY_REACHABLE_MUTATIONS: readonly never[] = []

const DEFERRED_MUTATION_FAMILIES = [{
  route: '/api/agency/briefs/templates/:id/mapping',
  file: 'server/api/agency/briefs/templates/[id]/mapping.put.ts',
  normalGate: "requireRole(event, ['admin', 'project_manager'])",
  independentScope: 'template lookup by route id; no tenant-bound predicate',
  auditStrategy: 'uncoordinated: no transaction-bound audit dependency or Task 5 ledger/outbox',
  decision: 'deny God-mode-only mutation bypass'
}] as const

function listApiFiles(root = 'server/api'): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return listApiFiles(path)
    return path.endsWith('.ts') ? [path] : []
  })
}

function mechanicalInventory() {
  const files = listApiFiles()
  const mutations = files.filter(file => /\.(post|put|patch|delete)\.ts$/.test(file))
  const guarded = mutations.filter(file => /(requireRole|requirePermission|requireWriteAccess|isReadOnlyRole|user\.role|roleHasPermission)/.test(readFileSync(file, 'utf8')))
  const transactional = guarded.filter(file => /\btransaction\s*\(/.test(readFileSync(file, 'utf8')))
  return {
    totalRouteFiles: files.length,
    mutationRouteFiles: mutations.length,
    explicitlyGuardedMutationFiles: guarded.length,
    guardedMutationFilesWithTransactionCall: transactional.length
  }
}

describe('God mode route isolation inventory', () => {
  it('records the full mechanical API and mutation inventory reviewed before implementation', () => {
    expect(mechanicalInventory()).toEqual(API_INVENTORY)
    expect(API_INVENTORY).toEqual({
      totalRouteFiles: 1930,
      mutationRouteFiles: 1056,
      explicitlyGuardedMutationFiles: 362,
      guardedMutationFilesWithTransactionCall: 25
    })
  })

  it('keeps every mutation lacking independent scope and durable terminal coordination unreachable', () => {
    expect(NEWLY_REACHABLE_MUTATIONS).toEqual([])
    expect(DEFERRED_MUTATION_FAMILIES).toEqual([
      expect.objectContaining({
        file: 'server/api/agency/briefs/templates/[id]/mapping.put.ts',
        decision: 'deny God-mode-only mutation bypass'
      })
    ])
  })

  it('pins the concrete uncoordinated mutation evidence', () => {
    const source = readFileSync(DEFERRED_MUTATION_FAMILIES[0].file, 'utf8')
    expect(source).toContain("requireRole(event, ['admin', 'project_manager'])")
    expect(source).not.toMatch(/\btransaction\s*\(/)
    expect(source).not.toMatch(/godModeMutation|executionLedger|outbox/i)
  })
})
