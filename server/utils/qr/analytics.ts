export interface DayRow { day: string, scans: number, unique: number }
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const iso = (d: Date) => d.toISOString().slice(0, 10)

export function parseQrRange(q: Record<string, unknown>, now = new Date()): { from: string, to: string } {
  const to = DAY_RE.test(String(q.to)) ? String(q.to) : iso(now)
  const from = DAY_RE.test(String(q.from)) ? String(q.from) : iso(new Date(new Date(to + 'T00:00:00Z').getTime() - 29 * 86_400_000))
  const span = (new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()) / 86_400_000
  if (span < 0 || span > 366) throw createError({ statusCode: 400, statusMessage: 'Range must be 0–366 days' })
  return { from, to }
}

export function fillDays(from: string, to: string, rows: DayRow[]): DayRow[] {
  const map = new Map(rows.map(r => [r.day, r]))
  const out: DayRow[] = []
  for (let t = new Date(from + 'T00:00:00Z').getTime(); t <= new Date(to + 'T00:00:00Z').getTime(); t += 86_400_000) {
    const day = iso(new Date(t)); const r = map.get(day)
    out.push({ day, scans: Number(r?.scans ?? 0), unique: Number(r?.unique ?? 0) })
  }
  return out
}
