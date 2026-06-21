import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import { roleHasPermission } from '~~/server/utils/permissions'
import type { AiTool } from '../toolRegistry'
import { ok, fail, escapeLike, type ToolContext, type ToolResult } from '../toolContext'
import { proposeAction } from '../pendingActions'
import { pickByExactName, type NamedRef } from './createTask'

/**
 * Promote a fact/routine into DEPARTMENT-shared memory (observe-and-learn spec §4b DS-2). The R&D rule:
 * shared scope is CURATED, never auto-written — so this is MANAGEMENT-gated and runs through
 * propose→confirm→audit (a human lead confirms before it becomes team-wide). The personal/observe
 * pipeline writes only to personal memory; team-wide knowledge arrives here, by hand, reviewed.
 */

const ilike = (name: string) => `%${escapeLike(name)}%`

const params = z.object({
  content: z.string().min(3).max(500),
  memType: z.enum(['semantic', 'procedural']).default('semantic'),
  departmentName: z.string().optional(),   // needed only when the user leads more than one department
})
type Args = z.infer<typeof params>

export type TeamMemoryDeps = {
  /** Departments the user belongs to (the candidate scopes they can promote into). */
  resolveDepartments: (userId: string) => Promise<NamedRef[]>
  propose: (ctx: ToolContext, payload: unknown) => Promise<string>
}

const defaultDeps: TeamMemoryDeps = {
  resolveDepartments: (userId) =>
    queryRows<NamedRef>(
      `SELECT d.id, d.name FROM departments d
         JOIN department_members dm ON dm.department_id = d.id
        WHERE dm.user_id = $1 AND d.is_active = true
        ORDER BY d.name`,
      [userId]),
  propose: (ctx, payload) => proposeAction(ctx, ctx.conversationId ?? null, 'propose_team_memory', payload),
}

export async function proposeTeamMemory(args: Args, ctx: ToolContext, deps: TeamMemoryDeps = defaultDeps): Promise<ToolResult> {
  // Curation gate: only management can promote knowledge to the shared department scope.
  if (!roleHasPermission(ctx.userRole, 'MANAGEMENT')) return fail('Only managers/leads can add to the team\'s shared knowledge.')
  if (!ctx.conversationId && ctx.source !== 'mcp') return fail('Cannot prepare this action outside a conversation.')
  const content = args.content.trim()
  if (!content) return fail('What should the team remember?')

  const depts = await deps.resolveDepartments(ctx.userId)
  if (depts.length === 0) return fail('You are not a member of any department, so there is no team to share this with.')
  let dept: NamedRef
  if (args.departmentName) {
    const matches = pickByExactName(depts.filter(d => d.name.toLowerCase().includes(args.departmentName!.toLowerCase())), args.departmentName)
    if (matches.length === 0) return fail(`You don't lead a department matching "${args.departmentName}".`)
    if (matches.length > 1) return ok({ disambiguation: { field: 'departmentName', options: matches } })
    dept = matches[0]!
  } else if (depts.length === 1) {
    dept = depts[0]!
  } else {
    return ok({ disambiguation: { field: 'departmentName', options: depts } })
  }

  const resolved = { departmentId: dept.id, departmentName: dept.name, content, memType: args.memType }
  return ok({ proposalId: await deps.propose(ctx, resolved), resolved })
}

export const teamMemoryTool: AiTool<Args> = {
  name: 'propose_team_memory',
  description: 'PROPOSE adding a fact or routine to your DEPARTMENT\'s shared memory (so every teammate\'s assistant '
    + 'knows it). Does NOT add anything — it prepares a proposal a manager confirms. Give the content; optionally a '
    + 'memType (semantic fact / procedural routine) and, if you lead several departments, which one. Managers/leads '
    + 'only. If the result has a `disambiguation`, ask which department. Only say it\'s ready when there is a `proposalId`.',
  parameters: params,
  mutates: true,
  requiredPermission: 'MANAGEMENT',
  handler: (a, c) => proposeTeamMemory(a, c),
}
