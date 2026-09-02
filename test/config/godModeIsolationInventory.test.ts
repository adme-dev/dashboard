import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  listRegisteredGodModeMutationFamilies,
  listReviewedGodModeReadRoutes
} from '../../server/utils/godMode/featureGate'

const API_INVENTORY = {
  totalRouteFiles: 2081,
  mutationRouteFiles: 1144,
  explicitlyGuardedMutationFiles: 398,
  guardedMutationFilesWithTransactionCall: 46
} as const

const DEFERRED_MUTATION_FAMILIES = [{
  route: '/api/agency/briefs/templates/:id/mapping',
  file: 'server/api/agency/briefs/templates/[id]/mapping.put.ts',
  normalGate: 'requireRole(event, [\'admin\', \'project_manager\'])',
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
  const guarded = mutations.filter(file => /(requireRole|requirePermission|requireWriteAccess|requireFreshCrmSearchAdmin|isReadOnlyRole|user\.role|roleHasPermission)/.test(readFileSync(file, 'utf8')))
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
      totalRouteFiles: 2081,
      mutationRouteFiles: 1144,
      explicitlyGuardedMutationFiles: 398,
      guardedMutationFilesWithTransactionCall: 46
    })
  })

  it('classifies each reviewed read route by exact method, gate, scope, and terminal strategy', () => {
    expect(listReviewedGodModeReadRoutes()).toEqual([
      {
        method: 'GET',
        path: '/api/agency/operations/queue-health',
        file: 'server/api/agency/operations/queue-health.get.ts',
        bypassedGate: 'permission',
        independentScope: 'agency-global authenticated staff operations telemetry',
        mutationClass: 'read-only',
        terminalStrategy: 'route attempt plus DB terminal with strict queue fallback'
      },
      {
        method: 'GET',
        path: '/api/crm/ai/status',
        file: 'server/api/crm/ai/status.get.ts',
        bypassedGate: 'feature_flag',
        independentScope: 'agency-global authenticated staff status',
        mutationClass: 'read-only',
        terminalStrategy: 'route attempt plus DB terminal with strict queue fallback'
      }
    ])

    const [permissionRoute, featureRoute] = listReviewedGodModeReadRoutes()
    expect(readFileSync(permissionRoute!.file, 'utf8')).toContain('requirePermission(event, \'ADMIN\')')
    expect(readFileSync(featureRoute!.file, 'utf8')).toContain('isApplicationCapabilityEnabled(event, isCrmAiEnabled)')
  })

  it('keeps every mutation lacking independent scope and durable terminal coordination unreachable', () => {
    expect(listRegisteredGodModeMutationFamilies()).toEqual([])
    expect(DEFERRED_MUTATION_FAMILIES).toEqual([
      expect.objectContaining({
        file: 'server/api/agency/briefs/templates/[id]/mapping.put.ts',
        decision: 'deny God-mode-only mutation bypass'
      })
    ])
  })

  it('has no production mutation registration and exactly one reviewed feature-gate consumer', () => {
    const files = listApiFiles()
    const mutationRegistrations = files.filter(file => readFileSync(file, 'utf8').includes('registerGodModeMutationFamily('))
    const featureConsumers = files.filter(file => readFileSync(file, 'utf8').includes('isApplicationCapabilityEnabled('))

    expect(mutationRegistrations).toEqual([])
    expect(featureConsumers).toEqual(['server/api/crm/ai/status.get.ts'])
  })

  it('pins the concrete uncoordinated mutation evidence', () => {
    const source = readFileSync(DEFERRED_MUTATION_FAMILIES[0].file, 'utf8')
    expect(source).toContain('requireRole(event, [\'admin\', \'project_manager\'])')
    expect(source).not.toMatch(/\btransaction\s*\(/)
    expect(source).not.toMatch(/godModeMutation|executionLedger|outbox/i)
  })
})
