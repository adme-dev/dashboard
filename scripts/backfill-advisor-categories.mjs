/**
 * One-shot backfill: classify NULL-category recommendations into one
 * of the 9 fixed categories using a single batched Groq call.
 *
 * Usage:
 *   node scripts/backfill-advisor-categories.mjs           # dry-run
 *   node scripts/backfill-advisor-categories.mjs --apply   # actually UPDATE
 *
 * Tenant-scoped via --tenant=<id>; without it, runs across ALL tenants
 * (uncommon — most installs have one tenant).
 *
 * Idempotent: only touches rows where category IS NULL. Re-running is
 * safe (it skips rows the previous run already classified).
 */

import 'dotenv/config'
import pg from 'pg'
import Groq from 'groq-sdk'

const CATEGORIES = [
  'cashflow',
  'collections',
  'pricing',
  'margin',
  'cost-control',
  'growth',
  'staffing',
  'tax-compliance',
  'risk',
]
const VALID = new Set(CATEGORIES)

const APPLY = process.argv.includes('--apply')
const TENANT_ARG = process.argv.find((a) => a.startsWith('--tenant='))
const TENANT_ID = TENANT_ARG ? TENANT_ARG.split('=')[1] : null
const BATCH_SIZE = 25 // recs per Groq call — keeps prompt under ~4k tokens

const GROQ_KEY = process.env.GROQ_API_KEY || process.env.GROQ_API
const DATABASE_URL = process.env.DATABASE_URL

if (!GROQ_KEY) {
  console.error('GROQ_API_KEY missing in env')
  process.exit(1)
}
if (!DATABASE_URL) {
  console.error('DATABASE_URL missing in env')
  process.exit(1)
}

const SYSTEM_PROMPT = `You classify financial-advisor recommendations into one of these 9 categories:

- cashflow      — liquidity, working capital, cash position, burn
- collections   — accounts receivable, debtor days, overdue invoices
- pricing       — rate cards, retainer pricing, discount strategy
- margin        — gross/net margin, profitability per project or service
- cost-control  — operating expenses, cost optimisation, vendor spend
- growth        — revenue growth, new clients, expansion, MRR/ARR
- staffing      — headcount, utilisation, hiring, team capacity
- tax-compliance — tax planning, statutory obligations, audit risk
- risk          — concentration risk, fraud, governance, regulatory

You will receive a JSON array of recommendations and must return a JSON
array of { id, category } pairs. Pick the single best fit per rec. If a
rec genuinely doesn't fit any category, return null for that one (do
NOT guess).

Respond ONLY with a JSON array. No prose, no markdown fences.`

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL })
  const groq = new Groq({ apiKey: GROQ_KEY })

  const tenantClause = TENANT_ID ? 'AND tenant_id = $1' : ''
  const params = TENANT_ID ? [TENANT_ID] : []

  const { rows } = await pool.query(
    `SELECT id, tenant_id, title, action
       FROM recommendations
      WHERE category IS NULL
        ${tenantClause}
      ORDER BY created_at DESC`,
    params
  )

  console.log(`Found ${rows.length} recommendation(s) with NULL category${TENANT_ID ? ` in tenant ${TENANT_ID}` : ''}.`)
  if (rows.length === 0) {
    await pool.end()
    return
  }

  if (!APPLY) {
    console.log('\nDry-run mode. Will classify but NOT update. Add --apply to actually persist.\n')
  }

  let classified = 0
  let unclassified = 0
  let updated = 0
  const summary = {}

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const payload = batch.map((r) => ({
      id: r.id,
      title: r.title,
      action: r.action,
    }))

    process.stdout.write(`Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rows.length / BATCH_SIZE)}: classifying ${batch.length} rec(s)... `)

    let parsed
    try {
      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        temperature: 0.1,
        max_tokens: 2000,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content:
              'Classify these recommendations. Return JSON: { "classifications": [ { "id": "...", "category": "cashflow" | ... | null }, ... ] }\n\n' +
              JSON.stringify(payload, null, 2),
          },
        ],
      })

      const raw = completion.choices[0]?.message?.content
      if (!raw) throw new Error('empty response')
      parsed = JSON.parse(raw)
    } catch (err) {
      console.log('FAILED')
      console.error('  Groq error:', err?.message ?? err)
      continue
    }

    const list = parsed.classifications ?? parsed.results ?? parsed
    if (!Array.isArray(list)) {
      console.log('FAILED (response not an array)')
      continue
    }

    console.log('done.')

    for (const item of list) {
      const id = item?.id
      const cat = item?.category
      if (!id) continue

      if (cat && VALID.has(cat)) {
        classified++
        summary[cat] = (summary[cat] ?? 0) + 1
        if (APPLY) {
          const result = await pool.query(
            `UPDATE recommendations SET category = $1 WHERE id = $2 AND category IS NULL`,
            [cat, id]
          )
          if (result.rowCount && result.rowCount > 0) updated++
        }
      } else {
        unclassified++
      }
    }
  }

  console.log('\n=== Summary ===')
  console.log(`Classified:   ${classified}`)
  console.log(`Unclassified: ${unclassified}`)
  if (APPLY) console.log(`Rows updated: ${updated}`)
  if (Object.keys(summary).length) {
    console.log('\nBreakdown by category:')
    for (const [cat, n] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cat.padEnd(15)} ${n}`)
    }
  }

  await pool.end()
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
