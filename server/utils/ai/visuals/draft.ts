import { queryOne as realQueryOne } from '~~/server/utils/db'
import { toKnowledgeContent, type VisualKnowledge } from './caption'

/**
 * Visuals → Knowledge — headless KB-draft creator. A captioned visual becomes an UNPUBLISHED knowledge
 * article (the spec's "KB DRAFT → review → publish" path), NEVER auto-searchable. Mirrors the
 * propose_knowledge_article executor's insert EXACTLY — `is_published = FALSE` + `review_status = 'draft'`
 * set explicitly (the column default is is_published=true, so an implicit insert would publish unreviewed
 * content — the drift the design forbids). A human publishes from the Command Center review queue.
 *
 * Headless (no conversation/pending-action) because the trigger is asset creation, not a chat turn — so it
 * writes the draft row directly rather than routing through proposeAction. The asset URL is embedded in the
 * content so the published article links back to the visual. The db is injected for unit-testing.
 */

export interface DraftDb {
  queryOne: <T>(sql: string, params?: unknown[]) => Promise<T | null>
}

const defaultDb: DraftDb = { queryOne: realQueryOne as DraftDb['queryOne'] }

export interface VisualDraftOptions {
  /** Article author (the user whose asset it was), or null for a system-authored draft. */
  authorId?: string | null
  /** Optional KB category. */
  category?: string | null
}

/** Title from the caption — terse, prefixed so review-queue rows read as visual captures. */
function draftTitle(vk: VisualKnowledge): string {
  const base = vk.caption.replace(/\s+/g, ' ').trim()
  return `Visual: ${base.length > 60 ? `${base.slice(0, 60)}…` : base}`
}

/**
 * Insert a captioned visual as a KB draft. Returns the new article id. The content is the terse,
 * embed-friendly knowledge line plus the asset link so the assistant can cite the actual visual.
 */
export async function createVisualKnowledgeDraft(
  vk: VisualKnowledge,
  opts: VisualDraftOptions = {},
  db: DraftDb = defaultDb
): Promise<string> {
  const content = `${toKnowledgeContent(vk)}\nAsset: ${vk.assetUrl}`
  const row = await db.queryOne<{ id: string }>(
    `INSERT INTO ai_knowledge_articles
       (title, content, category, source, author_id, is_published, proposed_by_agent, review_status)
     VALUES ($1, $2, $3, 'agent', $4, FALSE, TRUE, 'draft')
     RETURNING id`,
    [draftTitle(vk), content, opts.category ?? null, opts.authorId ?? null]
  )
  if (!row) throw new Error('visual knowledge draft insert returned no row')
  return row.id
}
