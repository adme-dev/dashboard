import { queryOne } from '~~/server/utils/db'
import type { ToolContext } from '../toolContext'
import { proposalToKnowledgeDraft } from '../tools/proposeKnowledgeArticle'
import type { ActionExecutor, ExecutorResult } from './types'

/**
 * The propose_knowledge_article executor (Phase 3). On confirm it inserts the article as a DRAFT —
 * `is_published = FALSE` and `review_status = 'draft'` are set EXPLICITLY (the column default is
 * is_published=true, so an implicit insert would publish unreviewed content — exactly the drift the
 * design forbids). The draft surfaces in the Command Center review queue; a human publish embeds it.
 * The insert is injected for unit-testing; the default writes directly via the db util.
 */
export type KnowledgeInserter = (draft: ReturnType<typeof proposalToKnowledgeDraft>) => Promise<{ id: string }>

const defaultInserter: KnowledgeInserter = async (draft) => {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO ai_knowledge_articles
       (title, content, category, source, author_id, is_published, proposed_by_agent, review_status)
     VALUES ($1, $2, $3, 'agent', $4, FALSE, TRUE, 'draft')
     RETURNING id`,
    [draft.title, draft.content, draft.category, draft.authorId],
  )
  if (!row) throw new Error('knowledge draft insert returned no row')
  return row
}

export function makeKnowledgeArticleExecutor(insert: KnowledgeInserter = defaultInserter): ActionExecutor {
  return {
    toolName: 'propose_knowledge_article',
    label: 'knowledge article',
    riskTier: 'confirm',
    async execute(payload: any, ctx: ToolContext): Promise<ExecutorResult> {
      const created = await insert(proposalToKnowledgeDraft(payload, ctx.userId))
      return {
        resultRef: created.id,
        summary: `✅ Drafted knowledge article “${payload?.title ?? 'article'}” for review — it won’t be searchable until a manager approves it.`,
      }
    },
  }
}

export const knowledgeArticleExecutor: ActionExecutor = makeKnowledgeArticleExecutor()
