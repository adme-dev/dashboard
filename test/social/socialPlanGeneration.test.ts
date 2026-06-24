import { describe, it, expect } from 'vitest'
import { parsePlanDrafts, spreadSchedule } from '../../app/utils/socialPlanGeneration'

describe('parsePlanDrafts', () => {
  it('parses a clean JSON array of drafts', () => {
    const raw = JSON.stringify({ posts: [
      { content: 'Hello', variants: { instagram: 'Hello 📸' }, hashtags: ['launch'] },
    ] })
    expect(parsePlanDrafts(raw)).toEqual([
      { content: 'Hello', variants: { instagram: 'Hello 📸' }, hashtags: ['launch'] },
    ])
  })
  it('strips ```json fences before parsing', () => {
    const raw = '```json\n{"posts":[{"content":"Hi"}]}\n```'
    expect(parsePlanDrafts(raw)).toEqual([{ content: 'Hi', variants: {}, hashtags: [] }])
  })
  it('returns [] for non-JSON garbage', () => {
    expect(parsePlanDrafts('the model rambled')).toEqual([])
  })
  it('drops entries without string content', () => {
    const raw = JSON.stringify({ posts: [{ content: 'ok' }, { variants: {} }, { content: 123 }] })
    expect(parsePlanDrafts(raw)).toEqual([{ content: 'ok', variants: {}, hashtags: [] }])
  })
})

describe('spreadSchedule', () => {
  it('returns evenly spaced ISO timestamps within the window', () => {
    const out = spreadSchedule(3, '2026-07-01T00:00:00.000Z', '2026-07-04T00:00:00.000Z')
    expect(out).toEqual([
      '2026-07-01T18:00:00.000Z', '2026-07-02T12:00:00.000Z', '2026-07-03T06:00:00.000Z',
    ])
  })
  it('returns [] for count <= 0', () => { expect(spreadSchedule(0, '2026-07-01T00:00:00.000Z', '2026-07-02T00:00:00.000Z')).toEqual([]) })
  it('clamps to the start when from === to', () => {
    expect(spreadSchedule(2, '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'))
      .toEqual(['2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'])
  })
})
