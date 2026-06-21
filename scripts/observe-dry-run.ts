/**
 * Observe & Learn W-2 — DRY-RUN validator. Reads REAL activity from the DB and runs the real pipeline
 * (source → sessionize → detectRoutines → real Groq distill) but WRITES NOTHING. Proves the end-to-end
 * feature produces sensible observed memories before the cron is ever enabled in prod.
 *
 *   DATABASE_URL=… GROQ_API_KEY=… pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json \
 *     scripts/observe-dry-run.ts [sinceISO]
 *
 * sinceISO defaults to 35 days ago (the prod window). Pass an older date to validate against historical
 * data, e.g. 2026-03-01T00:00:00Z.
 */
import Groq from 'groq-sdk'
import { queryRows } from '~~/server/utils/db'
import { createWorkEventSource } from '~~/server/utils/ai/observe/source'
import { sessionize, detectRoutines } from '~~/server/utils/ai/observe/sessionize'
import { distillObserved, describeRoutine } from '~~/server/utils/ai/observe/distill'
import { GROQ_MODELS } from '~~/server/utils/groqClient'
import { OBSERVE_EVENT_LIMIT } from '~~/server/utils/ai/observe/run'

// Direct Groq client — getGroqClient() uses useRuntimeConfig() which only exists inside Nitro, so for a
// standalone script we instantiate from the env directly. In prod the cron uses the real generateGroqInsight.
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
async function groqComplete(prompt: string): Promise<string> {
  const r = await groq.chat.completions.create({
    model: GROQ_MODELS.REASONING_20B,
    temperature: 0.2,
    max_tokens: 1500,
    messages: [
      { role: 'system', content: 'Reply with ONLY a JSON array, exactly as the user instruction specifies.' },
      { role: 'user', content: prompt }
    ]
  })
  return r.choices[0]?.message?.content || ''
}

async function main() {
  const since = process.argv[2] || new Date(Date.now() - 35 * 86_400_000).toISOString()
  console.log(`Observe dry-run — window since ${since} (nothing will be written)\n`)

  const source = createWorkEventSource({ queryRows })
  const users = await queryRows<{ user_id: string, name: string }>(
    `SELECT DISTINCT ta.user_id, tm.name
       FROM task_activities ta JOIN team_members tm ON tm.id = ta.user_id AND tm.is_active = TRUE
      WHERE ta.user_id IS NOT NULL AND ta.created_at > $1`,
    [since]
  )
  console.log(`${users.length} active user(s) with activity in window\n`)

  const complete = groqComplete

  let totalRoutines = 0
  let totalMemories = 0
  for (const u of users) {
    const events = await source.recentEvents(u.user_id, since, OBSERVE_EVENT_LIMIT)
    const routines = detectRoutines(sessionize(events))
    totalRoutines += routines.length
    console.log(`=== ${u.name} (${u.user_id.slice(0, 8)}): ${events.length} events, ${routines.length} routine(s) ===`)
    for (const r of routines) console.log(`   routine: ${describeRoutine(r)}`)
    if (routines.length) {
      const candidates = await distillObserved(routines, [], { complete })
      totalMemories += candidates.length
      for (const c of candidates) console.log(`   → would learn [${c.memType}, salience ${c.salience}]: ${c.content}`)
    }
    console.log('')
  }

  console.log(`SUMMARY: ${users.length} users · ${totalRoutines} routines · ${totalMemories} candidate memories. DRY RUN — nothing written.`)
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e)
  process.exit(1)
})
