import type { RoleSkillShortcut } from '~~/shared/types/roleSkills'

export type ResolvedRoleSkillSelection = Readonly<RoleSkillShortcut>
const resolvedSelections = new WeakMap<object, string>()

/** Only server-resolved selections bound to this actor can become guided chat context. */
export function isResolvedRoleSkillSelection(value: unknown, userId: string): value is ResolvedRoleSkillSelection {
  return !!value && typeof value === 'object' && resolvedSelections.get(value) === userId
}

/** Called after current eligibility/version checks. Contains no DB, tool or provider dependencies. */
export function bindResolvedRoleSkillSelection(shortcut: RoleSkillShortcut, userId: string): ResolvedRoleSkillSelection {
  const resolved = Object.freeze({ ...shortcut, tools: Object.freeze([...shortcut.tools]) as unknown as string[],
    sources: Object.freeze(shortcut.sources.map(source => Object.freeze({ ...source }))) as unknown as RoleSkillShortcut['sources'] })
  resolvedSelections.set(resolved, userId)
  return resolved
}
