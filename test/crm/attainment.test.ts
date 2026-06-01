import { describe, it, expect } from 'vitest'
import { attainmentPct, leaderboard, type TargetLike } from '~~/server/utils/crm/analytics'

describe('attainmentPct', () => {
  it('is actual/target as a percentage', () => {
    expect(attainmentPct(50000, 30000)).toBe(60)
    expect(attainmentPct(100, 100)).toBe(100)
    expect(attainmentPct(100, 250)).toBe(250)
  })
  it('returns 0 for a non-positive target', () => {
    expect(attainmentPct(0, 100)).toBe(0)
    expect(attainmentPct(-5, 100)).toBe(0)
  })
})

describe('leaderboard', () => {
  const won = [
    { owner_id: 'u1', amount: 30000 },
    { owner_id: 'u2', amount: 20000 },
    { owner_id: 'u2', amount: 25000 },
    { owner_id: null, amount: 9999 }, // unowned → ignored
  ]

  it('computes revenue attainment per rep and ranks by attainment desc', () => {
    const targets: TargetLike[] = [
      { user_id: 'u1', target_type: 'revenue', target_value: 50000 }, // 30k/50k = 60%
      { user_id: 'u2', target_type: 'revenue', target_value: 50000 }, // 45k/50k = 90%
    ]
    const rows = leaderboard(targets, won)
    expect(rows.map(r => r.user_id)).toEqual(['u2', 'u1']) // u2 ranked first
    expect(rows.find(r => r.user_id === 'u1')!.actual).toBe(30000)
    expect(rows.find(r => r.user_id === 'u2')!.attainment_pct).toBe(90)
  })

  it('count targets count won deals', () => {
    const targets: TargetLike[] = [{ user_id: 'u2', target_type: 'count', target_value: 4 }]
    const rows = leaderboard(targets, won)
    expect(rows[0].actual).toBe(2) // u2 has 2 won deals
    expect(rows[0].attainment_pct).toBe(50)
  })

  it('a rep with no won deals shows 0 actual / 0%', () => {
    const rows = leaderboard([{ user_id: 'u3', target_type: 'revenue', target_value: 10000 }], won)
    expect(rows[0]).toMatchObject({ actual: 0, attainment_pct: 0 })
  })
})
