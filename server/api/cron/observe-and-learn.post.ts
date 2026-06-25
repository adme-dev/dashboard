// server/api/cron/observe-and-learn.post.ts
// Observe & Learn W-2 (observe-and-learn spec §4). Invoked by the observe-cron companion Worker (Pages
// has no scheduled()). For each active staff user with recent activity, reads their OWN activity rows
// after a watermark, sessionizes + detects routines, distils ≤3 observed memories (gpt-oss-20b), writes
// them user-scoped (source='observed'), and advances the watermark. HARD-gated by AI_OBSERVE_ENABLED —
// with the flag off this is a no-op. Strictly user-scoped; one person never learns from another.
import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { createWorkEventSource } from '~~/server/utils/ai/observe/source'
import { runObservePass, ROUTINE_LOOKBACK_DAYS, type ObserveDeps } from '~~/server/utils/ai/observe/run'
import { upsertMemory, listRecentMemories } from '~~/server/utils/ai/memory/store'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // Dormancy gate — feature is off until the operator flips AI_OBSERVE_ENABLED on the deployed env.
  if (process.env.AI_OBSERVE_ENABLED !== 'true') {
    return { ok: true, skipped: 'disabled' }
  }

  const db = { queryRows, queryOne, execute }

  const deps: ObserveDeps = {
    source: createWorkEventSource(db),

    // Active staff who did anything in the last 30 days (bounds the pass to people actually working).
    listActiveUserIds: async () => {
      const rows = await queryRows<{ user_id: string }>(
        `SELECT DISTINCT ta.user_id
           FROM task_activities ta
           JOIN team_members tm ON tm.id = ta.user_id AND tm.is_active = TRUE
          WHERE ta.user_id IS NOT NULL AND ta.created_at > NOW() - INTERVAL '30 days'`
      )
      return rows.map(r => r.user_id)
    },

    // Fixed rolling read window — routine detection re-reads it each run (idempotent via upsert dedup).
    windowStart: () => new Date(Date.now() - ROUTINE_LOOKBACK_DAYS * 86_400_000).toISOString(),

    getWatermark: async (userId) => {
      const row = await queryOne<{ observed_through_at: string }>(
        `SELECT observed_through_at FROM ai_observe_state WHERE user_id = $1`,
        [userId]
      )
      return row?.observed_through_at ?? null
    },

    setWatermark: async (userId, throughISO, stats) => {
      await execute(
        `INSERT INTO ai_observe_state (user_id, observed_through_at, last_run_at, events_seen, memories_written, updated_at)
           VALUES ($1, $2, NOW(), $3, $4, NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET observed_through_at = EXCLUDED.observed_through_at,
               last_run_at = NOW(),
               events_seen = ai_observe_state.events_seen + EXCLUDED.events_seen,
               memories_written = ai_observe_state.memories_written + EXCLUDED.memories_written,
               updated_at = NOW()`,
        [userId, throughISO, stats.events, stats.memories]
      )
    },

    recentContents: async userId => (await listRecentMemories(userId, 30)).map(m => m.content),
    save: input => upsertMemory(input),

    // maxTokens is generous: gpt-oss-20b is a reasoning model that spends tokens thinking before the
    // JSON — 400 truncated the array mid-output (dry-run finding), losing good candidates. 1500 leaves room.
    complete: prompt => generateGroqInsight(prompt, {
      model: GROQ_MODELS.REASONING_20B,
      temperature: 0.2,
      maxTokens: 1500,
      featureKey: 'observe_and_learn_distillation',
      requestId: 'cron-observe-and-learn',
      metadata: {
        route: '/api/cron/observe-and-learn',
        lookbackDays: ROUTINE_LOOKBACK_DAYS,
        promptChars: prompt.length,
      },
      systemPrompt: 'Reply with ONLY a JSON array, exactly as the user instruction specifies.'
    })
  }

  const result = await runObservePass(deps)
  return { ok: true, ...result }
})
