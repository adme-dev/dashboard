import { describe, it, expect, vi } from 'vitest'
import {
  validateWebhook, buildDigestBlocks, buildCriticalBlocks, postSlack,
} from '~~/server/utils/anomalyDetection/slackBudget'

const item = (over: Partial<any> = {}) => ({
  type: 'adspend', severity: 'critical', title: 'Mornington Nissan (google_ads) underspending',
  description: '$312 of an expected $2,750 — $2,438 behind pace.', client: 'Mornington Nissan', ...over,
})

describe('validateWebhook', () => {
  it('accepts only Slack incoming webhooks', () => {
    expect(validateWebhook('https://hooks.slack.com/services/T/B/x')).toBe(true)
    expect(validateWebhook('https://evil.example.com/x')).toBe(false)
    expect(validateWebhook('http://hooks.slack.com/services/x')).toBe(false)
  })
})

describe('buildDigestBlocks', () => {
  it('renders an all-clear block when there are no anomalies', () => {
    const blocks = buildDigestBlocks([], { date: '2 Jun 2026', dashboardUrl: 'https://x/agency/anomalies' })
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text!.text).toContain('No pacing issues')
  })

  it('renders summary counts + items + footer when anomalies exist', () => {
    const blocks = buildDigestBlocks([item(), item({ severity: 'warning', client: 'McRae LDV' })], {
      date: '2 Jun 2026', dashboardUrl: 'https://x/agency/anomalies',
    })
    const joined = blocks.map(b => b.text!.text).join('\n')
    expect(joined).toContain('1 critical')
    expect(joined).toContain('1 warning')
    expect(joined).toContain('2 client')
    expect(joined).toContain('View all')
  })
})

describe('buildCriticalBlocks', () => {
  it('renders one block per item when 3 or fewer', () => {
    expect(buildCriticalBlocks([item(), item()])).toHaveLength(2)
  })
  it('collapses to a single rollup when more than 3', () => {
    const blocks = buildCriticalBlocks([item(), item(), item(), item()])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text!.text).toContain('4 new critical')
  })
  it('returns empty for no items', () => {
    expect(buildCriticalBlocks([])).toHaveLength(0)
  })
})

describe('postSlack', () => {
  it('POSTs blocks and returns ok on 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const res = await postSlack('https://hooks.slack.com/services/x', [{ type: 'section', text: { type: 'mrkdwn', text: 'hi' } }], '#budget', fetchImpl as any)
    expect(res.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledOnce()
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as any).body)
    expect(body.channel).toBe('#budget')
    expect(body.blocks).toHaveLength(1)
  })
  it('returns an error on non-200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const res = await postSlack('https://hooks.slack.com/services/x', [], undefined, fetchImpl as any)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('500')
  })
  it('returns an error on network failure', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'))
    const res = await postSlack('https://hooks.slack.com/services/x', [], undefined, fetchImpl as any)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('boom')
  })
})
