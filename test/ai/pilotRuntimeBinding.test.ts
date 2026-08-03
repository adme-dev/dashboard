import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { bindPilotUatContext } from '~~/server/utils/ai/governance/pilotRuntimeBinding'

const releaseId = '10000000-0000-4000-8000-000000000001'

function context() {
  const row = (id: string, state: 'pilot' | 'active') => ({
    sourceType: 'pack', isLatestPackVersion: true, releaseState: state, releaseId: id,
    departmentId: 'd', packVersionId: `v-${id}`, packVersion: 1, packLabel: id,
    packKey: 'paid_media_read_draft', instructionsPreamble: `instructions-${id}`,
    packModelFeatureKey: null, packMaxInputTokens: null, packMaxOutputTokens: null,
    packMaxCostUsdMicros: null, packMaxLatencyMs: null, capabilityVersionId: null,
    capabilityKey: null, requiredPermissionGroup: null, capabilityModelFeatureKey: null,
    capabilityMaxInputTokens: null, capabilityMaxOutputTokens: null,
    capabilityMaxCostUsdMicros: null, capabilityMaxLatencyMs: null, toolName: null, accessMode: null
  }) as any
  return {
    identity: { userId: 'u', role: 'admin' }, runtimePolicy: { mode: 'pilot', authenticatedCoreTools: ['search_knowledge', 'get_tasks'] },
    observedMemoryEnabled: false, permissionGroups: ['ADMIN'], isReadOnly: false, departments: [],
    clientScope: { mode: 'all_active', assignments: [] }, preferences: { personaKey: null, disabledTools: [], memoryEnabled: false },
    activePacks: [
      { releaseId, departmentId: 'd', packVersionId: `v-${releaseId}`, packKey: 'paid_media_read_draft', version: 1, label: 'selected', releaseState: 'pilot' },
      { releaseId: 'other', departmentId: 'd', packVersionId: 'v-other', packKey: 'finance_read_draft', version: 1, label: 'other', releaseState: 'active' }
    ],
    catalogInstructionsPreamble: 'all', catalogRows: [row(releaseId, 'pilot'), row('other', 'active')]
  } as any
}

describe('pilot UAT exact runtime binding', () => {
  it('narrows catalog rows, active packs, and instructions to one admitted pilot release', () => {
    const bound = bindPilotUatContext(context(), releaseId)
    expect(bound.catalogRows.map(row => row.releaseId)).toEqual([releaseId])
    expect(bound.activePacks.map(pack => pack.releaseId)).toEqual([releaseId])
    expect(bound.catalogInstructionsPreamble).toBe(`instructions-${releaseId}`)
  })

  it('fails closed when the exact current pilot release is unavailable', () => {
    expect(() => bindPilotUatContext(context(), 'missing')).toThrowError(expect.objectContaining({ code: 'pilot_uat_release_binding_unavailable' }))
  })

  it('does not persist persona or distill memory as a controlled UAT side effect', () => {
    const engine = readFileSync('server/utils/aiChatEngine.ts', 'utf8')
    expect(engine).toContain('if (persona && event && !pilotUat)')
    expect(engine).toContain('if (event && cfg.aiMemoryDistillEnabled && !pilotUat')
  })
})
