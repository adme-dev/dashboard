export type AssistantCatalogMode = 'legacy' | 'governed' | 'god_mode'

export type AssistantReleaseAccessBasis = 'god_mode' | 'company_owner' | 'catalog_policy'

export type AssistantToolRestrictionReason
  = 'release_suspended'
    | 'release_retired'
    | 'not_in_active_catalog'
    | 'capability_permission_missing'
    | 'access_mode_mismatch'
    | 'persona_narrowed'
    | 'read_only'
    | 'personal_disabled'

export interface MyAssistantConfig {
  personaKey: string | null
  disabledTools: string[]
  memoryEnabled: boolean
}

export interface MyAssistantDepartmentView {
  name: string
  kind: 'organizational' | 'workspace'
  membershipRole: 'lead' | 'senior' | 'member' | 'junior' | null
  primary: boolean
  manager: boolean
  accessReason: 'membership' | 'manager' | 'company_policy'
  escalationManagerName: string | null
}

export interface MyAssistantClientScopeView {
  mode: 'all_active' | 'assigned'
  assignments: Array<{
    name: string
    role: 'primary_am' | 'secondary_am' | 'support'
  }>
}

export interface MyAssistantActivePackView {
  key: string
  label: string
  version: number
  departmentName: string
  releaseState: 'draft' | 'pilot' | 'active' | 'suspended' | 'retired'
  accessBasis: AssistantReleaseAccessBasis
}

export interface MyAssistantAuthorityView {
  accessBasis?: AssistantReleaseAccessBasis
  label?: string
  description?: string
  toolCoverage?: {
    available: number
    registered: number
    complete: boolean
  }
  runtimeMode: 'legacy' | 'pilot' | 'enforced'
  coverageStatus: 'legacy' | 'governed' | 'authenticated_core' | 'god_mode'
  currentRole: string
  readOnly: boolean
  permissionGroups: string[]
  departments: MyAssistantDepartmentView[]
  clientScope: MyAssistantClientScopeView
  activePacks: MyAssistantActivePackView[]
  catalogMode: AssistantCatalogMode
}

export interface MyAssistantToolView {
  name: string
  description: string
  mutates: boolean
  personallyEnabled: boolean
  availableInCurrentFocus: boolean
  currentFocusReason: AssistantToolRestrictionReason | null
}

export interface MyAssistantToolRestrictionView {
  toolName: string
  reason: AssistantToolRestrictionReason
  message: string
}

export interface MyAssistantView extends MyAssistantConfig {
  observedMemoryEnabled: boolean
  authority: MyAssistantAuthorityView
  tools: MyAssistantToolView[]
  restrictions: MyAssistantToolRestrictionView[]
}

export interface MyAssistantToolsView {
  tools: MyAssistantToolView[]
  restrictions: MyAssistantToolRestrictionView[]
  catalogMode: AssistantCatalogMode
}
