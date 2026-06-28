// Pure resolvers for brief→project task assignment. Deterministic-or-unassigned:
// never guess a specific person — manual assignment in the board is the fallback.

function clean(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** First usable id from the candidate list (template dept → brief dept → fallback). */
export function pickDepartmentId(candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    const v = clean(c)
    if (v) return v
  }
  return null
}

// A template task's free-text role counts as "the manager" when it names a PM/lead.
// Use negative lookbehind/lookahead to avoid matching inside hyphenated strings like "non-manager".
const MANAGER_ROLE = /(?<![\w-])(project\s*manager|manager|pm|lead|account\s*lead)(?![\w-])/i

export interface ResolveAssigneeInput {
  defaultAssigneeId?: string | null
  defaultRole?: string | null
  projectManagerId: string | null
}

export function resolveTaskAssignee(
  input: ResolveAssigneeInput,
): { assigneeId: string | null; source: 'explicit' | 'manager' | 'unassigned' } {
  const explicit = clean(input.defaultAssigneeId)
  if (explicit) return { assigneeId: explicit, source: 'explicit' }

  const role = clean(input.defaultRole)
  const pm = clean(input.projectManagerId)
  if (role && pm && MANAGER_ROLE.test(role)) return { assigneeId: pm, source: 'manager' }

  return { assigneeId: null, source: 'unassigned' }
}
