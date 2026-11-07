import { bindResolvedRoleSkillSelection, type ResolvedRoleSkillSelection } from '../roleSkillSelectionAuthority'
import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import type { PermissionGroup } from '~~/server/utils/permissions'
import { resolveFreshStaffRoleAuthority, type FreshStaffRoleAuthority } from '../freshStaffRoleAuthority'
import type { RoleSkillAdminWorkflow, RoleSkillBindings, RoleSkillShortcut } from '~~/shared/types/roleSkills'
import type { AiTool } from '../toolRegistry'
import { filterToolsForUser } from '../toolRegistry'
import type { PersonalAssistantContext } from '../personalAssistantContext'
import { composeEffectiveAssistantTools } from '../governance/catalogComposition'
import { resolvePersona } from '../personas'
import { resolveChatRuntime } from '../chatRuntime'
import { readActiveRoleSkills } from './store'

export { isResolvedRoleSkillSelection, type ResolvedRoleSkillSelection } from '../roleSkillSelectionAuthority'

export type RoleSkillActor = FreshStaffRoleAuthority
export const resolveRoleSkillActor = resolveFreshStaffRoleAuthority
export interface RoleSkillEligibilityDependencies {
  active: () => Promise<RoleSkillAdminWorkflow[]>
  actor: (event: H3Event, userId: string) => Promise<RoleSkillActor>
  toolsEnabled: (event: H3Event) => boolean
}

export function roleSkillBindingMatches(bindings: RoleSkillBindings, actor: RoleSkillActor): boolean {
  return bindings.allRoles === true
    || (!!actor.roleId && bindings.roleIds.includes(actor.roleId))
    || (!actor.customRoleId && bindings.systemRoles.includes(actor.role))
    || bindings.permissionGroups.some(group => actor.permissionGroups.includes(group as PermissionGroup))
}
const defaultDependencies: RoleSkillEligibilityDependencies = {
  active: () => readActiveRoleSkills(), actor: resolveRoleSkillActor,
  toolsEnabled: event => resolveChatRuntime(event).toolsEnabled
}
export interface RoleSkillEligibilityInput { context: PersonalAssistantContext, tools: AiTool<unknown>[], event: H3Event }
export async function listRoleSkills(input: RoleSkillEligibilityInput, overrides: Partial<RoleSkillEligibilityDependencies> = {}): Promise<RoleSkillShortcut[]> {
  const deps = { ...defaultDependencies, ...overrides }
  if (!deps.toolsEnabled(input.event)) return []
  const actor = await deps.actor(input.event, input.context.identity.userId)
  // Both fresh explicit role grants and already-admitted current chat context must permit a tool.
  const groups = actor.permissionGroups.filter(group => input.context.permissionGroups.includes(group))
  const permitted = filterToolsForUser(input.tools, actor.role, groups, actor.readOnly || input.context.isReadOnly)
  const workflows = await deps.active()
  return workflows.flatMap((workflow) => {
    const active = workflow.active
    if (!active?.enabled || !active.publishedAt || !roleSkillBindingMatches(active.bindings, actor)) return []
    const composition = composeEffectiveAssistantTools({
      rbacFilteredTools: permitted, catalogRows: input.context.catalogRows,
      grantedPermissionGroups: groups, personaToolAllowlist: resolvePersona(workflow.persona).toolAllowlist,
      readOnly: actor.readOnly || input.context.isReadOnly, disabledTools: input.context.preferences.disabledTools,
      runtimePolicy: input.context.runtimePolicy, actorUserId: actor.userId
      // Owner/God mode never bypasses workflow availability or explicit role grants.
    })
    const available = new Set(composition.tools.map(tool => tool.name))
    if (!workflow.tools.length || !workflow.tools.every(name => available.has(name))) return []
    return [{ key: workflow.key, versionId: active.id, version: active.version, label: active.label, description: active.description,
      prompt: active.prompt, persona: workflow.persona, group: workflow.group, tools: [...workflow.tools], sources: [...workflow.sources] }]
  })
}
const selectionSchema = z.strictObject({ key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), versionId: z.string().uuid() })
export async function resolveRoleSkillSelection(
  selection: unknown, input: RoleSkillEligibilityInput, overrides: Partial<RoleSkillEligibilityDependencies> = {}
): Promise<ResolvedRoleSkillSelection> {
  const parsed = selectionSchema.safeParse(selection)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid workflow selection' })
  const available = await listRoleSkills(input, overrides)
  const shortcut = available.find(skill => skill.key === parsed.data.key && skill.versionId === parsed.data.versionId)
  if (!shortcut) throw createError({ statusCode: 409, statusMessage: 'Workflow changed or is no longer available; choose it again' })
  return bindResolvedRoleSkillSelection(shortcut, input.context.identity.userId)
}
