import { describe, it, expect } from 'vitest'
import { nextBestActions, type OppSignals } from '~~/server/utils/crm/nextBestAction'

const healthy: OppSignals = {
  status: 'open',
  stageName: 'Proposal',
  stageIsWon: false,
  stageIsLost: false,
  daysSinceLastActivity: 2,
  daysSinceCreated: 10,
  openTaskCount: 1,
  overdueTaskCount: 0,
  daysSinceLastComm: 3,
  leadScore: 80,
}

const keys = (s: OppSignals) => nextBestActions(s).map(a => a.key)

describe('nextBestActions', () => {
  it('a healthy, recently-touched deal with a next step needs nothing', () => {
    expect(nextBestActions(healthy)).toEqual([])
  })

  it('returns nothing for closed (won/lost) deals', () => {
    expect(nextBestActions({ ...healthy, status: 'won' })).toEqual([])
    expect(nextBestActions({ ...healthy, status: 'lost' })).toEqual([])
  })

  it('flags a deal with no open task as missing a next step (high)', () => {
    const out = nextBestActions({ ...healthy, openTaskCount: 0 })
    const a = out.find(x => x.key === 'add_next_step')
    expect(a).toBeTruthy()
    expect(a!.priority).toBe('high')
  })

  it('flags overdue tasks and cites the count', () => {
    const a = nextBestActions({ ...healthy, overdueTaskCount: 2 }).find(x => x.key === 'clear_overdue')!
    expect(a.priority).toBe('high')
    expect(a.reason).toContain('2')
  })

  it('flags a stalled deal (no activity in >14d) and cites the days', () => {
    const a = nextBestActions({ ...healthy, daysSinceLastActivity: 30 }).find(x => x.key === 're_engage')!
    expect(a.priority).toBe('high')
    expect(a.reason).toContain('30')
  })

  it('treats never-touched as a re-engage with an explainable reason', () => {
    const a = nextBestActions({ ...healthy, daysSinceLastActivity: null }).find(x => x.key === 're_engage')!
    expect(a.reason.toLowerCase()).toContain('no activity')
  })

  it('suggests reaching out when comms have gone quiet (>21d)', () => {
    expect(keys({ ...healthy, daysSinceLastComm: 40 })).toContain('log_comm')
  })

  it('suggests qualifying when the lead score is low', () => {
    const a = nextBestActions({ ...healthy, leadScore: 25 }).find(x => x.key === 'qualify')!
    expect(a.reason).toContain('25')
  })

  it('suggests a stage review for long-open deals', () => {
    expect(keys({ ...healthy, daysSinceCreated: 60 })).toContain('review_stage')
  })

  it('ranks high-priority suggestions first', () => {
    const out = nextBestActions({ ...healthy, openTaskCount: 0, daysSinceLastComm: 40, daysSinceCreated: 60 })
    const priorities = out.map(a => a.priority)
    const rank = { high: 0, medium: 1, low: 2 }
    for (let i = 1; i < priorities.length; i++) {
      expect(rank[priorities[i]!]).toBeGreaterThanOrEqual(rank[priorities[i - 1]!])
    }
  })

  it('every suggestion carries a non-empty, explainable reason', () => {
    const out = nextBestActions({ ...healthy, openTaskCount: 0, overdueTaskCount: 3, daysSinceLastActivity: 90, daysSinceLastComm: 50, leadScore: 10, daysSinceCreated: 120 })
    expect(out.length).toBeGreaterThan(0)
    for (const a of out) {
      expect(a.title.length).toBeGreaterThan(0)
      expect(a.reason.length).toBeGreaterThan(0)
    }
  })
})
