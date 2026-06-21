import { z } from 'zod'
import { isReadOnlyRole } from '~~/server/utils/permissions'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { proposeAction } from '../pendingActions'

const params = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  category: z.string().optional(),
})
type Args = z.infer<typeof params>

export type KnowledgeArticleDeps = {
  propose: (ctx: ToolContext, payload: unknown) => Promise<string>
}

const defaultDeps: KnowledgeArticleDeps = {
  propose: (ctx, payload) => proposeAction(ctx, ctx.conversationId!, 'propose_knowledge_article', payload),
}

/**
 * Agent knowledge contribution (command-center spec §3). PROPOSE a knowledge-base article only — on
 * confirm, the executor inserts an `is_published=false`, `review_status='draft'` row that a human
 * reviews→publishes from the Command Center. NEVER auto-publishes: `search_knowledge` is fail-closed
 * to published rows, so a draft is never searchable until approved (this prevents the agent
 * self-publishing → reading-back-as-fact drift loop). Distinct from personal memory, which auto-writes
 * privately; the shared KB is propose→review→publish.
 */
export async function proposeKnowledgeArticle(args: Args, ctx: ToolContext, deps: KnowledgeArticleDeps = defaultDeps): Promise<ToolResult> {
  if (isReadOnlyRole(ctx.userRole)) return fail('You do not have permission to contribute knowledge articles.')
  if (!ctx.conversationId) return fail('Cannot prepare a knowledge article outside a conversation.')
  const title = args.title?.trim()
  const content = args.content?.trim()
  if (!title) return fail('A knowledge article needs a title.')
  if (!content) return fail('A knowledge article needs some content.')

  const resolved = { title, content, category: args.category?.trim() || null }
  const proposalId = await deps.propose(ctx, resolved)
  return ok({ proposalId, resolved })
}

/** Map a stored propose_knowledge_article proposal + author into the draft-insert shape. */
export function proposalToKnowledgeDraft(payload: any, authorId: string) {
  return {
    title: payload?.title,
    content: payload?.content,
    category: payload?.category ?? null,
    authorId,
  }
}

export const knowledgeArticleTool: AiTool<Args> = {
  name: 'propose_knowledge_article',
  description: 'PROPOSE adding an article to the shared agency knowledge base (e.g. an FAQ from a question you '
    + 'couldn\'t answer, or an SOP for a repeated process). This does NOT publish anything — it prepares a DRAFT '
    + 'the user confirms, which then goes to a human review queue; it is NOT searchable until a manager approves it. '
    + 'Use when something is worth capturing as shared agency truth (NOT a private note about the user — use remember '
    + 'for that). Provide a clear title, the content, and optionally a category. Only say it is ready when the result '
    + 'has a `proposalId`. Never claim the article was published or added to the knowledge base.',
  parameters: params,
  mutates: true,
  handler: (a, c) => proposeKnowledgeArticle(a, c),
}
