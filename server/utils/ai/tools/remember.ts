import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { upsertMemory } from '../memory/store'
import { indexMemoryVector } from '../memory/embed'
import type { UpsertMemoryInput } from '../memory/types'

const params = z.object({
  content: z.string().min(1),
  memType: z.enum(['semantic', 'episodic', 'procedural']).default('semantic'),
})
type Args = z.infer<typeof params>

export type RememberDeps = {
  save: (input: UpsertMemoryInput, ctx: ToolContext) => Promise<string>
}

const defaultDeps: RememberDeps = {
  save: input => upsertMemory(input),
}

/**
 * Explicit memory capture. Unlike the write tools, this is NOT `mutates`: personal memory is
 * private + low-risk, so we write it directly (no confirm card) — the user explicitly asked to be
 * remembered. Always scoped to ctx.userId; never another user. Explicit memories get higher salience
 * than inferred ones (0.7 vs 0.5) since the user opted in. (Vector indexing for recall is handled by
 * the memory orchestration; even un-embedded rows surface via the recency fallback.)
 */
export async function remember(args: Args, ctx: ToolContext, deps: RememberDeps = defaultDeps): Promise<ToolResult> {
  const content = args.content.trim()
  if (!content) return fail('There is nothing to remember.')

  let id: string
  try {
    id = await deps.save(
      { userId: ctx.userId, memType: args.memType, content, source: 'explicit', salience: 0.7 },
      ctx,
    )
  } catch {
    // Fail-safe like every other tool: a transient DB error returns a recoverable message the model
    // can relay, instead of propagating and breaking the whole turn.
    return fail('I could not save that just now — please try again in a moment.')
  }

  // Index for vector recall (best-effort, fully fail-safe inside indexMemoryVector). Without it an
  // explicit memory is recall-able only via the recency fallback.
  void indexMemoryVector({ event: ctx.event, id, userId: ctx.userId, scope: 'user', memType: args.memType, content })
    .catch(() => {})

  return ok({ remembered: true, id, content })
}

export const rememberTool: AiTool<Args> = {
  name: 'remember',
  description: 'Save a durable personal note about the user or how they like to work, so you recall it in future conversations (e.g. "I report Acme in AUD", "I prefer ROAS over CPA"). Use when the user asks you to remember something, or states a stable preference worth keeping. memType: semantic (a fact/preference, default), episodic (something that happened), procedural (a routine they follow). This saves a PRIVATE note for this user only — it is not shared and is not the agency knowledge base.',
  parameters: params,
  // intentionally not `mutates`: private, low-risk → write directly, no confirmation card.
  handler: (a, c) => remember(a, c),
}
