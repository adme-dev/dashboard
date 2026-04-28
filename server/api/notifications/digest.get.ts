/**
 * Activity digest for the current user.
 * Aggregates `notifications` rows by board + reason, with top items per board.
 *
 * Phase C — read-only, no separate digest table or cron. Computed on demand.
 *
 * Query: ?range=today (default) | week
 */
import { queryRows } from '~~/server/utils/db'
import { setCacheHeaders } from '~~/server/utils/cacheHeaders'

interface BoardRollup {
  boardId: string
  boardName: string
  counts: { mentioned: number; assigned: number; watching: number; direct: number }
  topItems: Array<{ taskId: string; taskTitle: string; count: number }>
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)
  const range = query.range === 'week' ? 'week' : 'today'

  // Compute range start
  const now = new Date()
  let startedAt: Date
  if (range === 'week') {
    startedAt = new Date(now.getTime() - 7 * 24 * 60 * 60_000)
  } else {
    // Today, in user's timezone — for the MVP we use Australia/Sydney by default.
    // Use Intl to get the local YYYY-MM-DD then construct midnight local.
    const tz = (user as any).timezone || 'Australia/Sydney'
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const parts = fmt.formatToParts(now)
    const y = parts.find(p => p.type === 'year')?.value
    const m = parts.find(p => p.type === 'month')?.value
    const d = parts.find(p => p.type === 'day')?.value
    // Construct ISO with TZ offset — use a midpoint approach: midnight UTC then back-pedal.
    // Simpler: parse "<y>-<m>-<d>T00:00:00" as if in tz, but JS Date doesn't accept that.
    // Workaround: midnight UTC of that calendar day then back-shift by user's offset.
    const utcMidnight = new Date(`${y}-${m}-${d}T00:00:00Z`)
    const tzOffsetFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    })
    // Pull "GMT+10" or "GMT+10:30" from formatted parts
    let offsetMinutes = 0
    try {
      const offsetPart = tzOffsetFmt.formatToParts(now).find(p => p.type === 'timeZoneName')?.value || ''
      const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(offsetPart)
      if (match) {
        const sign = match[1] === '+' ? 1 : -1
        const hours = parseInt(match[2] || '0', 10)
        const minutes = parseInt(match[3] || '0', 10)
        offsetMinutes = sign * (hours * 60 + minutes)
      }
    } catch { /* default 0 */ }
    startedAt = new Date(utcMidnight.getTime() - offsetMinutes * 60_000)
  }

  setCacheHeaders(event, 60, 60)

  try {
    const rows = await queryRows(`
      SELECT
        (n.metadata->>'boardId') AS board_id_str,
        d.id AS board_id,
        d.name AS board_name,
        n.reason,
        (n.metadata->>'taskId') AS task_id,
        (n.metadata->>'taskTitle') AS task_title,
        COUNT(*)::int AS count
      FROM notifications n
      LEFT JOIN departments d ON (n.metadata->>'boardId')::uuid = d.id
      WHERE n.user_id = $1
        AND n.created_at >= $2
        AND n.reason IS NOT NULL
      GROUP BY d.id, d.name, n.reason, task_id, task_title
      ORDER BY d.id NULLS LAST, count DESC
      LIMIT 500
    `, [user.id, startedAt])

    // Roll up: { boardId -> rollup }
    const rollups = new Map<string, BoardRollup>()
    let total = 0

    for (const r of rows) {
      const bId = r.board_id || 'unassigned'
      const bName = r.board_name || 'Other activity'
      total += r.count
      let bucket = rollups.get(bId)
      if (!bucket) {
        bucket = {
          boardId: bId,
          boardName: bName,
          counts: { mentioned: 0, assigned: 0, watching: 0, direct: 0 },
          topItems: [],
        }
        rollups.set(bId, bucket)
      }
      // Reason → counts bucket
      const reasonKey = r.reason === 'watching_board' || r.reason === 'watching_item'
        ? 'watching'
        : (['mentioned', 'assigned', 'direct'].includes(r.reason) ? r.reason : 'direct')
      bucket.counts[reasonKey as 'mentioned' | 'assigned' | 'watching' | 'direct'] += r.count

      // Top items aggregation (across all reasons within the board)
      if (r.task_id && r.task_title) {
        const existing = bucket.topItems.find(t => t.taskId === r.task_id)
        if (existing) existing.count += r.count
        else bucket.topItems.push({ taskId: r.task_id, taskTitle: r.task_title, count: r.count })
      }
    }

    // Trim each board's topItems to 3, sorted by count desc
    const boards: BoardRollup[] = []
    for (const b of rollups.values()) {
      b.topItems.sort((a, z) => z.count - a.count)
      b.topItems = b.topItems.slice(0, 3)
      boards.push(b)
    }
    // Boards sorted by total activity desc
    boards.sort((a, z) => {
      const sumA = a.counts.mentioned + a.counts.assigned + a.counts.watching + a.counts.direct
      const sumZ = z.counts.mentioned + z.counts.assigned + z.counts.watching + z.counts.direct
      return sumZ - sumA
    })

    return {
      range,
      startedAt: startedAt.toISOString(),
      totalNotifications: total,
      boards,
    }
  } catch (error: any) {
    if (error.message?.includes('does not exist')) {
      return { range, startedAt: startedAt.toISOString(), totalNotifications: 0, boards: [] }
    }
    console.error('Failed to compute digest:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to compute digest' })
  }
})
