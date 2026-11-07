import { resolveGodModeAuthority } from '~~/server/utils/godMode/authority'
import type { ActiveCatalogRow } from '~~/server/utils/ai/governance/catalogComposition'
import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { RoleSkillAdminWorkflow } from '~~/shared/types/roleSkills'
import type { PersonalAssistantContext } from '~~/server/utils/ai/personalAssistantContext'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import { resolveCatalogRuntimePolicy } from '~~/server/utils/ai/governance/catalogComposition'
import { listRoleSkills, resolveRoleSkillSelection, isResolvedRoleSkillSelection, type RoleSkillActor } from '~~/server/utils/ai/roleSkills/eligibility'

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const versionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const event = {} as import('h3').H3Event
let actor: RoleSkillActor
let context: PersonalAssistantContext
let workflow: RoleSkillAdminWorkflow
const tools: AiTool<unknown>[] = [
  { name: 'get_budget_health', description: 'Read budget', parameters: z.object({}), requiredPermission: 'MEDIA_BUYING', handler: vi.fn() },
  { name: 'get_finance_snapshot', description: 'Accounting', parameters: z.object({}), requiredPermission: 'FINANCE', handler: vi.fn() }
]
const deps = { active: vi.fn(), actor: vi.fn(), toolsEnabled: vi.fn() }
const input = () => ({ context, tools, event })
beforeEach(() => {
  actor = { userId: actorId, role: 'media_buyer', roleId: 'role', customRoleId: null, permissionGroups: ['MEDIA_BUYING'], readOnly: false }
  context = { identity: { userId: actorId, role: 'owner' }, permissionGroups: ['MEDIA_BUYING', 'FINANCE'], isReadOnly: false,
    catalogRows: [], preferences: { personaKey: null, disabledTools: [], memoryEnabled: true }, runtimePolicy: resolveCatalogRuntimePolicy('legacy') } as PersonalAssistantContext
  workflow = { key: 'marketing_budget_health', group: 'Marketing', persona: 'media_buyer', tools: ['get_budget_health'], sources: [], revision: 1,
    active: { id: versionId, workflowKey: 'marketing_budget_health', version: 1, label: 'Budget health', description: 'Read delivery budget', prompt: 'Ask for the client, then read budget health.', enabled: true,
      bindings: { allRoles: false, roleIds: [], systemRoles: [], permissionGroups: ['MEDIA_BUYING'] }, createdAt: new Date().toISOString(), createdBy: null,
      publishedAt: new Date().toISOString(), publishedBy: null, publishReason: 'Seed', auditReason: 'Seed' }, draft: null, history: [] }
  deps.active.mockImplementation(async () => [workflow])
  deps.actor.mockImplementation(async () => actor)
  deps.toolsEnabled.mockReturnValue(true)
})
describe('role-specific curated workflow eligibility', () => {
  it('returns only published eligible prompts with the fixed tools and workflow persona', async () => {
    expect(await listRoleSkills(input(), deps)).toMatchObject([{ key: workflow.key, versionId, persona: 'media_buyer', tools: ['get_budget_health'] }])
  })
  it('empty bindings grant no discovery while explicit all roles still requires actual tool permission', async () => {
    workflow.active!.bindings = { allRoles: false, roleIds: [], systemRoles: [], permissionGroups: [] }
    expect(await listRoleSkills(input(), deps)).toEqual([])
    workflow.active!.bindings.allRoles = true
    expect(await listRoleSkills(input(), deps)).toHaveLength(1)
    actor.permissionGroups = []
    expect(await listRoleSkills(input(), deps)).toEqual([])
  })
  it('Finance never follows static owner defaults or an attached marketing role', async () => {
    workflow.tools = ['get_finance_snapshot']
    workflow.persona = 'finance'
    workflow.active!.bindings.allRoles = true
    actor.role = 'owner'
    actor.customRoleId = 'limited-role'
    expect(await listRoleSkills(input(), deps)).toEqual([])
    actor.permissionGroups = ['FINANCE']
    expect(await listRoleSkills(input(), deps)).toHaveLength(1)
    context.permissionGroups = ['MEDIA_BUYING']
    expect(await listRoleSkills(input(), deps)).toEqual([])
    actor.permissionGroups = []
    expect(await listRoleSkills(input(), deps)).toEqual([])
  })
  it('a custom role replaces legacy system-role attachments', async () => {
    workflow.active!.bindings = { allRoles: false, roleIds: [], permissionGroups: [], systemRoles: ['media_buyer'] }
    expect(await listRoleSkills(input(), deps)).toHaveLength(1)
    actor.customRoleId = 'custom-role'
    expect(await listRoleSkills(input(), deps)).toEqual([])
  })
  it('hides personal disabled, unavailable registered tools, unrelated personas and enforced unreleased tools', async () => {
    context.preferences.disabledTools = ['get_budget_health']
    expect(await listRoleSkills(input(), deps)).toEqual([])
    context.preferences.disabledTools = []
    expect(await listRoleSkills({ ...input(), tools: [] }, deps)).toEqual([])
    workflow.persona = 'sales'
    expect(await listRoleSkills(input(), deps)).toEqual([])
    workflow.persona = 'media_buyer'
    context.runtimePolicy = resolveCatalogRuntimePolicy('enforced')
    expect(await listRoleSkills(input(), deps)).toEqual([])
  })
  it('a read-only role cannot discover a workflow whose required operation mutates', async () => {
    actor.readOnly = true
    const mutating = [{ ...tools[0]!, mutates: true }]
    expect(await listRoleSkills({ ...input(), tools: mutating }, deps)).toEqual([])
  })
  it('never exposes unpublished, disabled or inaccessible workflow data', async () => {
    workflow.active!.publishedAt = null
    expect(await listRoleSkills(input(), deps)).toEqual([])
    workflow.active!.publishedAt = new Date().toISOString()
    workflow.active!.enabled = false
    expect(await listRoleSkills(input(), deps)).toEqual([])
    deps.active.mockRejectedValueOnce(new Error('Database unavailable'))
    await expect(listRoleSkills(input(), deps)).rejects.toThrow('Database unavailable')
  })
  it('resolves only the current version and privately brands it for its authenticated actor', async () => {
    const selected = await resolveRoleSkillSelection({ key: workflow.key, versionId }, input(), deps)
    expect(isResolvedRoleSkillSelection(selected, actorId)).toBe(true)
    expect(isResolvedRoleSkillSelection({ ...selected }, actorId)).toBe(false)
    expect(isResolvedRoleSkillSelection(selected, 'other')).toBe(false)
    expect(Object.isFrozen(selected)).toBe(true)
    workflow.active!.id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    await expect(resolveRoleSkillSelection({ key: workflow.key, versionId }, input(), deps)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('runtime disable and revoked grants deny a previously selected shortcut on the next call', async () => {
    await resolveRoleSkillSelection({ key: workflow.key, versionId }, input(), deps)
    actor.permissionGroups = []
    await expect(resolveRoleSkillSelection({ key: workflow.key, versionId }, input(), deps)).rejects.toMatchObject({ statusCode: 409 })
    actor.permissionGroups = ['MEDIA_BUYING']
    deps.toolsEnabled.mockReturnValue(false)
    expect(await listRoleSkills(input(), deps)).toEqual([])
  })
})

describe('existing actor-bound owner catalogue admission preserves workflow hard gates', () => {
  async function ownerAuthority(id = actorId) {
    return resolveGodModeAuthority({ context: {} } as H3Event, id, {
      queryOneFresh: vi.fn().mockResolvedValue({ id }), processEnv: {}
    })
  }
  function useOwnerControlInventory() {
    actor.role = 'owner'
    context.catalogRows = [{ sourceType: 'capability', isLatestPackVersion: false, releaseState: 'draft',
      releaseId: 'draft-control', departmentId: 'department', toolName: 'get_budget_health', accessMode: 'read', requiredPermissionGroup: 'MEDIA_BUYING',
      packVersionId: null, packKey: null, instructionsPreamble: '', packModelFeatureKey: null,
      packMaxInputTokens: null, packMaxOutputTokens: null, packMaxCostUsdMicros: null, packMaxLatencyMs: null,
      capabilityVersionId: 'draft-capability', capabilityKey: 'budget', capabilityModelFeatureKey: null,
      capabilityMaxInputTokens: null, capabilityMaxOutputTokens: null, capabilityMaxCostUsdMicros: null, capabilityMaxLatencyMs: null } satisfies ActiveCatalogRow]
  }
  it('honours resolver-issued current owner release authority after fresh explicit grants', async () => {
    useOwnerControlInventory()
    context.godModeAuthority = await ownerAuthority()
    expect(await listRoleSkills(input(), deps)).toHaveLength(1)
    deps.toolsEnabled.mockReturnValue(false)
    expect(await listRoleSkills(input(), deps)).toEqual([])
    deps.toolsEnabled.mockReturnValue(true)
    context.godModeAuthority = undefined
    expect(await listRoleSkills(input(), deps)).toEqual([])
  })
  it('owner release admission cannot restore disabled, unrelated-persona, read-only or unattached workflows', async () => {
    useOwnerControlInventory()
    context.godModeAuthority = await ownerAuthority()
    context.preferences.disabledTools = ['get_budget_health']
    expect(await listRoleSkills(input(), deps)).toEqual([])
    context.preferences.disabledTools = []
    workflow.persona = 'sales'
    expect(await listRoleSkills(input(), deps)).toEqual([])
    workflow.persona = 'media_buyer'
    actor.readOnly = true
    expect(await listRoleSkills({ ...input(), tools: [{ ...tools[0]!, mutates: true }] }, deps)).toEqual([])
    actor.readOnly = false
    context.isReadOnly = true
    expect(await listRoleSkills({ ...input(), tools: [{ ...tools[0]!, mutates: true }] }, deps)).toEqual([])
    context.isReadOnly = false
    workflow.active!.bindings = { allRoles: false, roleIds: [], systemRoles: [], permissionGroups: [] }
    expect(await listRoleSkills(input(), deps)).toEqual([])
  })
  it('owner release admission never grants missing Finance or other explicit permissions', async () => {
    useOwnerControlInventory()
    context.godModeAuthority = await ownerAuthority()
    workflow.active!.bindings.allRoles = true
    workflow.tools = ['get_finance_snapshot']
    workflow.persona = 'finance'
    expect(await listRoleSkills(input(), deps)).toEqual([])
    actor.permissionGroups = ['FINANCE']
    expect(await listRoleSkills(input(), deps)).toHaveLength(1)
    context.permissionGroups = ['MEDIA_BUYING']
    expect(await listRoleSkills(input(), deps)).toEqual([])
    actor.permissionGroups = []
    expect(await listRoleSkills(input(), deps)).toEqual([])
  })
  it('a fresh demotion, inactive authority or emergency-disabled authority cannot retain owner release admission', async () => {
    useOwnerControlInventory()
    context.runtimePolicy = resolveCatalogRuntimePolicy('enforced')
    context.godModeAuthority = await ownerAuthority()
    actor.role = 'media_buyer'
    expect(await listRoleSkills(input(), deps)).toEqual([])
    actor.role = 'owner'
    context.godModeAuthority = await resolveGodModeAuthority({ context: {} } as H3Event, actorId, {
      queryOneFresh: vi.fn().mockResolvedValue(null), processEnv: {}
    })
    expect(await listRoleSkills(input(), deps)).toEqual([])
    context.godModeAuthority = await resolveGodModeAuthority({ context: {} } as H3Event, actorId, {
      queryOneFresh: vi.fn().mockResolvedValue({ id: actorId }), processEnv: { GOD_MODE_DISABLED: 'true' }
    })
    expect(await listRoleSkills(input(), deps)).toEqual([])
  })
  it('applies the same owner release admission and hard narrowing to supplemental native names', async () => {
    useOwnerControlInventory()
    context.godModeAuthority = await ownerAuthority()
    workflow.tools = ['ask_spend_controller']
    const supplemental = [{ name: 'ask_spend_controller', description: 'Read-only specialist', parameters: z.object({}), requiredPermission: 'MEDIA_BUYING' as const, handler: vi.fn() }]
    expect(await listRoleSkills({ ...input(), tools: supplemental }, deps)).toHaveLength(1)
    context.preferences.disabledTools = ['ask_spend_controller']
    expect(await listRoleSkills({ ...input(), tools: supplemental }, deps)).toEqual([])
    context.preferences.disabledTools = []
    actor.permissionGroups = []
    expect(await listRoleSkills({ ...input(), tools: supplemental }, deps)).toEqual([])
  })
  it('foreign or cloned authority cannot admit unreleased ordinary catalogue tools', async () => {
    useOwnerControlInventory()
    context.runtimePolicy = resolveCatalogRuntimePolicy('enforced')
    const authority = await ownerAuthority()
    context.godModeAuthority = { ...authority }
    expect(await listRoleSkills(input(), deps)).toEqual([])
    context.godModeAuthority = await ownerAuthority('cccccccc-cccc-4ccc-8ccc-cccccccccccc')
    expect(await listRoleSkills(input(), deps)).toEqual([])
    context.godModeAuthority = undefined
    actor.role = 'media_buyer'
    expect(await listRoleSkills(input(), deps)).toEqual([])
  })
})
