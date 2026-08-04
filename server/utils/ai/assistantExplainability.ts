import type { PermissionGroup } from '~~/server/utils/permissions'
import type {
  AssistantToolRestrictionReason,
  MyAssistantToolRestrictionView,
  MyAssistantView
} from '~~/shared/types/aiAssistant'
import { composeEffectiveAssistantTools } from './governance/catalogComposition'
import type { PersonalAssistantContext } from './personalAssistantContext'
import { resolvePersona } from './personas'

export interface ExplainableAssistantTool {
  name: string
  description: string
  mutates?: boolean
  requiredPermission?: PermissionGroup
}

const RESTRICTION_MESSAGES: Record<AssistantToolRestrictionReason, string> = {
  release_suspended: 'This capability is temporarily suspended by an administrator.',
  release_retired: 'This capability has been retired and is no longer available.',
  not_in_active_catalog: 'This tool is not included in an active, evaluated pack for your departments.',
  capability_permission_missing: 'Your current permission areas do not allow this governed capability.',
  access_mode_mismatch: 'The active capability does not allow this tool’s read or proposal mode.',
  persona_narrowed: 'Your current focus does not use this tool; another focus may include it.',
  read_only: 'Your current role is read-only, so proposal and write tools are unavailable.',
  personal_disabled: 'You turned this tool off in your personal assistant settings.'
}

function restriction(
  toolName: string,
  reason: AssistantToolRestrictionReason
): MyAssistantToolRestrictionView {
  return { toolName, reason, message: RESTRICTION_MESSAGES[reason] }
}

function uniqueRestrictions(
  restrictions: MyAssistantToolRestrictionView[]
): MyAssistantToolRestrictionView[] {
  const seen = new Set<string>()
  return restrictions.filter((item) => {
    const key = `${item.toolName}:${item.reason}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Build the client-safe explanation of the exact authority used by the chat engine. The function
 * intentionally omits user/client/department identifiers, catalog instructions, and raw rows.
 */
export function buildMyAssistantExplainability(
  context: PersonalAssistantContext,
  availableTools: ExplainableAssistantTool[]
): MyAssistantView {
  // The route supplies the registry so this presenter remains pure and inexpensive to unit-test.
  const registry = availableTools
  const godModeActive = context.godModeAuthority?.active === true
    && context.godModeAuthority.actorUserId === context.identity.userId
  const granted = new Set(context.permissionGroups)
  const permissionTools = godModeActive
    ? registry
    : registry.filter(tool => !tool.requiredPermission || granted.has(tool.requiredPermission))
  const baseline = composeEffectiveAssistantTools({
    rbacFilteredTools: permissionTools,
    catalogRows: context.catalogRows,
    grantedPermissionGroups: context.permissionGroups,
    readOnly: context.isReadOnly,
    runtimePolicy: context.runtimePolicy,
    authority: context.godModeAuthority,
    actorUserId: context.identity.userId
  })
  const persona = resolvePersona(context.preferences.personaKey)
  const effective = composeEffectiveAssistantTools({
    rbacFilteredTools: permissionTools,
    catalogRows: context.catalogRows,
    grantedPermissionGroups: context.permissionGroups,
    personaToolAllowlist: persona.toolAllowlist,
    disabledTools: context.preferences.disabledTools,
    readOnly: context.isReadOnly,
    runtimePolicy: context.runtimePolicy,
    authority: context.godModeAuthority,
    actorUserId: context.identity.userId
  })
  const effectiveNames = new Set(effective.tools.map(tool => tool.name))
  const disabledNames = new Set(context.preferences.disabledTools)
  const effectiveReasonByTool = new Map<string, AssistantToolRestrictionReason>()
  for (const denial of effective.denials) {
    if (!effectiveReasonByTool.has(denial.toolName)) {
      effectiveReasonByTool.set(denial.toolName, denial.reason)
    }
  }

  const tools = baseline.tools.map(tool => {
    const personallyEnabled = godModeActive || !disabledNames.has(tool.name)
    return {
      name: tool.name,
      description: tool.description,
      mutates: tool.mutates === true,
      personallyEnabled,
      availableInCurrentFocus: effectiveNames.has(tool.name),
      currentFocusReason: effectiveNames.has(tool.name)
        ? null
        : personallyEnabled
          ? effectiveReasonByTool.get(tool.name) ?? null
          : 'personal_disabled' as const
    }
  })

  const departmentNames = new Map(
    context.departments.map(department => [department.departmentId, department.name])
  )
  const personallyDisabledRestrictions = godModeActive ? [] : baseline.tools
    .filter(tool => disabledNames.has(tool.name))
    .map(tool => restriction(tool.name, 'personal_disabled'))
  const restrictions = uniqueRestrictions([
    ...personallyDisabledRestrictions,
    ...effective.denials.map(denial => restriction(denial.toolName, denial.reason))
  ])

  return {
    personaKey: context.preferences.personaKey,
    disabledTools: [...context.preferences.disabledTools],
    memoryEnabled: context.preferences.memoryEnabled,
    observedMemoryEnabled: context.observedMemoryEnabled,
    authority: {
      ...(context.identity.role === 'owner'
        ? {
            accessBasis: godModeActive ? 'god_mode' as const : 'company_owner' as const,
            label: godModeActive ? 'God mode active' : 'Company owner access',
            description: godModeActive
              ? 'All registered tools are available. Authenticated identity, tenant isolation, and immutable audit still apply.'
              : 'Tools remain governed by catalog, permission, role, and personal assistant policy.',
            toolCoverage: {
              available: effective.tools.length,
              registered: registry.length,
              complete: effective.tools.length === registry.length
            }
          }
        : {}),
      runtimeMode: context.runtimePolicy.mode,
      coverageStatus: baseline.coverageStatus,
      currentRole: context.identity.role,
      readOnly: context.isReadOnly,
      permissionGroups: [...context.permissionGroups],
      departments: context.departments.map(department => ({
        name: department.name,
        kind: department.kind,
        membershipRole: department.membershipRole,
        primary: department.isPrimary,
        manager: department.isManager,
        accessReason: department.accessReason,
        escalationManagerName: department.escalationManager?.name ?? null
      })),
      clientScope: {
        mode: context.clientScope.mode,
        assignments: context.clientScope.mode === 'assigned'
          ? context.clientScope.assignments.map(assignment => ({
              name: assignment.name,
              role: assignment.role
            }))
          : []
      },
      activePacks: context.activePacks.map(pack => ({
        key: pack.packKey,
        label: pack.label,
        version: pack.version,
        departmentName: departmentNames.get(pack.departmentId) ?? 'Company',
        releaseState: pack.releaseState,
        accessBasis: pack.accessBasis
      })),
      catalogMode: baseline.mode
    },
    tools,
    restrictions
  }
}
