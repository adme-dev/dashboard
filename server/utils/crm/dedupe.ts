// server/utils/crm/dedupe.ts
// Pure duplicate-detection helpers (TDD): normalisation, name similarity (Dice
// over bigrams), a per-pair similarity score, and blocked candidate-pair
// generation. The DB-side pg_trgm indexes (mig 148) back a future scale-up; this
// in-app pass runs on a client's bounded contact set for the suggestions endpoint.

export function normalizeEmail(e?: string | null): string {
  return (e ?? '').trim().toLowerCase()
}

export function normalizePhone(p?: string | null): string {
  return (p ?? '').replace(/\D/g, '')
}

// Match key: the trailing subscriber digits, ignoring trunk '0' / country-code
// prefixes (so AU 0412 345 678 ≡ +61 412 345 678). Empty when too short to trust.
export function phoneKey(p?: string | null): string {
  const d = normalizePhone(p)
  return d.length >= 9 ? d.slice(-9) : d
}

export function normalizeName(n?: string | null): string {
  return (n ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function bigrams(s: string): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2))
  return out
}

// Sørensen–Dice coefficient over character bigrams (0..1).
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return a.length ? 1 : 0
  if (a.length < 2 || b.length < 2) return 0
  const A = bigrams(a)
  const B = bigrams(b)
  const counts = new Map<string, number>()
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1)
  let overlap = 0
  for (const g of B) {
    const c = counts.get(g) ?? 0
    if (c > 0) { overlap++; counts.set(g, c - 1) }
  }
  return (2 * overlap) / (A.length + B.length)
}

import { transaction } from '~~/server/utils/db'

export interface DedupeRecord { id: string, email?: string | null, phone?: string | null, name: string }

// 0..1 confidence that two records are the same entity. Exact email ⇒ 1; exact
// phone ⇒ ≥0.85; otherwise name similarity (capped below the exact-contact tiers).
export function similarityScore(a: DedupeRecord, b: DedupeRecord): number {
  const ea = normalizeEmail(a.email), eb = normalizeEmail(b.email)
  if (ea && ea === eb) return 1
  let score = 0
  const pa = phoneKey(a.phone), pb = phoneKey(b.phone)
  if (pa && pa === pb && pa.length >= 7) score = Math.max(score, 0.85)
  const nameSim = diceCoefficient(normalizeName(a.name), normalizeName(b.name))
  score = Math.max(score, nameSim * 0.9)
  return Math.min(score, 1)
}

export interface CandidatePair { a_id: string, b_id: string, score: number }

// Blocked candidate generation: only compare records that share an exact email,
// exact phone, or a name prefix — keeps it ~linear instead of O(n²). Each pair is
// scored once and kept when it clears the threshold; result sorted by score desc.
export function candidatePairs(records: DedupeRecord[], threshold = 0.72): CandidatePair[] {
  const blocks = new Map<string, DedupeRecord[]>()
  const add = (key: string, r: DedupeRecord) => {
    const arr = blocks.get(key) ?? []
    arr.push(r)
    blocks.set(key, arr)
  }
  for (const r of records) {
    const e = normalizeEmail(r.email); if (e) add('e:' + e, r)
    const p = phoneKey(r.phone); if (p && p.length >= 7) add('p:' + p, r)
    const n = normalizeName(r.name); if (n.length >= 3) add('n:' + n.slice(0, 3), r)
  }
  const scored = new Set<string>()
  const out: CandidatePair[] = []
  for (const group of blocks.values()) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!, b = group[j]! // i,j within bounds
        if (a.id === b.id) continue
        const pk = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id
        if (scored.has(pk)) continue
        scored.add(pk)
        const score = similarityScore(a, b)
        if (score >= threshold) out.push({ a_id: a.id, b_id: b.id, score })
      }
    }
  }
  return out.sort((x, y) => y.score - x.score)
}

// ── Merge ─────────────────────────────────────────────────────────────────────
// Reassign every child row from loser→winner, delete the loser, and log the
// merge — all in ONE transaction so there are never orphaned rows pointing at a
// deleted contact. Returns per-table reassignment counts.
export async function mergeContacts(opts: {
  clientId: string
  entityType: 'person' | 'company'
  winnerId: string
  loserId: string
  actor: string | null
}): Promise<Record<string, number>> {
  const { clientId, entityType, winnerId, loserId } = opts
  if (winnerId === loserId) throw new Error('Cannot merge a record into itself')
  const isPerson = entityType === 'person'
  const table = isPerson ? 'crm_people' : 'crm_companies'

  return transaction(async (db: any) => {
    // Both records must exist, be live, and belong to this client.
    const both = await db.query(
      `SELECT id FROM ${table} WHERE id = ANY($1::uuid[]) AND client_id = $2 AND deleted_at IS NULL`,
      [[winnerId, loserId], clientId],
    )
    if (both.rows.length !== 2) throw new Error('Winner and loser must both exist for this client')

    const counts: Record<string, number> = {}
    const run = async (key: string, sql: string, params: unknown[]) => {
      const r = await db.query(sql, params)
      counts[key] = r.rowCount ?? 0
    }

    // Opportunities (+ people→company link when merging companies).
    if (isPerson) {
      await run('opportunities', `UPDATE crm_opportunities SET person_id = $1 WHERE person_id = $2 AND client_id = $3`, [winnerId, loserId, clientId])
    } else {
      await run('people', `UPDATE crm_people SET company_id = $1 WHERE company_id = $2 AND client_id = $3`, [winnerId, loserId, clientId])
      await run('opportunities', `UPDATE crm_opportunities SET company_id = $1 WHERE company_id = $2 AND client_id = $3`, [winnerId, loserId, clientId])
    }

    // Polymorphic children keyed by (target_type, target_id).
    await run('activities', `UPDATE crm_activities SET target_id = $1 WHERE target_type = $4 AND target_id = $2 AND client_id = $3`, [winnerId, loserId, clientId, entityType])
    await run('tasks', `UPDATE crm_tasks SET target_id = $1 WHERE target_type = $4 AND target_id = $2 AND client_id = $3`, [winnerId, loserId, clientId, entityType])
    // Scores are derived — drop the loser's; the winner's recomputes on next signal.
    await run('scores', `DELETE FROM crm_scores WHERE target_type = $3 AND target_id = $1 AND client_id = $2`, [loserId, clientId, entityType])
    await run('score_history', `DELETE FROM crm_score_history WHERE target_type = $3 AND target_id = $1 AND client_id = $2`, [loserId, clientId, entityType])

    // Relationships: drop loser edges that would collide with an existing winner
    // edge, reassign the rest (both ends), then clear any winner→winner self-edge.
    for (const [col, otherCol, otherIdCol] of [['from_id', 'to_type', 'to_id'], ['to_id', 'from_type', 'from_id']] as const) {
      const typeCol = col === 'from_id' ? 'from_type' : 'to_type'
      await db.query(
        `DELETE FROM crm_relationships l
          WHERE l.client_id = $1 AND l.${typeCol} = $4 AND l.${col} = $2
            AND EXISTS (SELECT 1 FROM crm_relationships w
                         WHERE w.client_id = $1 AND w.${typeCol} = $4 AND w.${col} = $3
                           AND w.${otherCol} = l.${otherCol} AND w.${otherIdCol} = l.${otherIdCol}
                           AND w.relationship_type = l.relationship_type)`,
        [clientId, loserId, winnerId, entityType],
      )
      await db.query(
        `UPDATE crm_relationships SET ${col} = $3 WHERE client_id = $1 AND ${typeCol} = $4 AND ${col} = $2`,
        [clientId, loserId, winnerId, entityType],
      )
    }
    await run('relationships_selfedges', `DELETE FROM crm_relationships WHERE client_id = $1 AND from_type = to_type AND from_id = to_id`, [clientId])

    // Keep the loser's audit history attached to the survivor.
    await run('audit_log', `UPDATE crm_audit_log SET entity_id = $1 WHERE entity_type = $4 AND entity_id = $2 AND client_id = $3`, [winnerId, loserId, clientId, entityType])

    // Remove the loser and log the merge.
    await db.query(`DELETE FROM ${table} WHERE id = $1 AND client_id = $2`, [loserId, clientId])
    await db.query(
      `INSERT INTO crm_merge_log (client_id, entity_type, winner_id, loser_id, detail, merged_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [clientId, entityType, winnerId, loserId, JSON.stringify(counts), opts.actor],
    )
    return counts
  })
}
