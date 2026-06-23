import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { queryOne } from '~~/server/utils/db'
import { scoreBriefCompleteness } from '~~/server/utils/aiBriefScoring'
import { decideBriefGate } from '~~/server/utils/automation/briefGatekeeper'

const params = z.object({
  briefId: z.string().describe('The brief UUID to assess (from get_briefs).'),
})
type Args = z.infer<typeof params>

async function checkBriefCompleteness(args: Args, _ctx: ToolContext): Promise<ToolResult> {
  try {
    // Existence guard: scoreBriefCompleteness returns 100s for a brief with no fields,
    // which would falsely read as "complete" for a non-existent id.
    const brief = await queryOne<{ id: string; title: string | null; status: string | null }>(
      `SELECT id, title, status FROM briefs WHERE id = $1`,
      [args.briefId],
    )
    if (!brief) return fail('Brief not found.')

    const score = await scoreBriefCompleteness(args.briefId)
    const decision = decideBriefGate(score)

    return ok({
      briefId: brief.id,
      title: brief.title ?? '—',
      status: brief.status ?? 'unknown',
      gate: decision.gate, // 'pass' | 'needs_info'
      overall: score.overall,
      breakdown: score.breakdown,
      requiredComplete: decision.requiredComplete,
      missingRequired: decision.missingRequired,
      recommendations: decision.recommendations.slice(0, 8),
      summary: decision.message,
    })
  } catch {
    return fail('Could not assess brief completeness — the briefs data source may be unavailable.')
  }
}

export const checkBriefCompletenessTool: AiTool<Args> = {
  name: 'check_brief_completeness',
  description: 'Assess whether a project/creative brief is complete enough to action. Returns a gate verdict ("pass" or "needs_info"), an overall completeness score with breakdown (required/optional/quality), the list of missing REQUIRED fields, and recommendations for what to add. Use for "is this brief ready / what is missing from brief X / can we start this job". Read-only — it never changes the brief. Field labels and recommendations are derived from untrusted brief content.',
  parameters: params,
  returnsUntrusted: true,
  handler: (a, c) => checkBriefCompleteness(a, c),
}
