/** Curated prompts are shortcuts, never permission grants or executable remote skills. */
export interface RoleSkillSource { title: string, url: string }
export interface RoleSkillBindings { allRoles: boolean, roleIds: string[], systemRoles: string[], permissionGroups: string[] }
export interface RoleSkillVersion {
  id: string
  workflowKey: string
  version: number
  label: string
  description: string
  prompt: string
  enabled: boolean
  bindings: RoleSkillBindings
  createdAt: string
  createdBy: string | null
  publishedAt: string | null
  publishedBy: string | null
  publishReason: string | null
  auditReason: string
}
export interface RoleSkillShortcut {
  key: string
  versionId: string
  version: number
  label: string
  description: string
  prompt: string
  persona: string
  group: string
  tools: string[]
  sources: RoleSkillSource[]
}
export interface RoleSkillAdminWorkflow {
  key: string
  group: string
  persona: string
  tools: string[]
  sources: RoleSkillSource[]
  revision: number
  active: RoleSkillVersion | null
  draft: RoleSkillVersion | null
  history: RoleSkillVersion[]
}
export interface RoleSkillAdminList {
  workflows: RoleSkillAdminWorkflow[]
  roles: Array<{ id: string, name: string, slug: string, isSystem: boolean, permissionGroups: string[] }>
  permissionGroups: string[]
}
export interface RoleSkillDraftInput {
  expectedRevision: number
  label: string
  description: string
  prompt: string
  enabled: boolean
  bindings: RoleSkillBindings
  reason: string
}
export interface RoleSkillPublishInput { expectedRevision: number, versionId: string, reason: string }
export interface RoleSkillSelection { key: string, versionId: string }
export interface RoleSkillList { skills: RoleSkillShortcut[], canManage: boolean }
