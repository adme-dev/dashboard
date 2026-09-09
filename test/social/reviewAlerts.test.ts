import { describe, expect, it, vi } from 'vitest'
import { flagReviewForAttention, processReviewAlerts } from '~~/server/utils/socialInbox/reviewAlerts'

describe('review alerts', () => {
  it.each([1, 2, 3])('flags a new %s-star review as urgent and queues an alert', async rating => {
    const db = {execute:vi.fn(async()=>1)}
    await flagReviewForAttention(db, 'c', {rating, platformTimestamp:new Date().toISOString()})
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("priority = 'urgent'"), ['c', true])
  })
  it('flags historical negative reviews without sending a backlog of alerts', async () => {
    const db = {execute:vi.fn(async()=>1)}
    await flagReviewForAttention(db, 'c', {rating:3, platformTimestamp:'2020-01-01'})
    expect(db.execute).toHaveBeenCalledWith(expect.any(String), ['c', false])
  })
  it.each([{rating:5}, {rating:2, hasReply:true}])('does not alert on positive or answered reviews: %j', async review => {
    const db = {execute:vi.fn(async()=>1)}
    await flagReviewForAttention(db, 'c', {...review, platformTimestamp:new Date().toISOString()})
    expect(db.execute).not.toHaveBeenCalled()
  })
  it('retains failed deliveries for retry and marks only delivered alerts', async () => {
    const db = {queryRows:vi.fn(async()=>[{id:'c1'},{id:'c2'}]), execute:vi.fn(async()=>1)}
    const send = vi.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(true)
    vi.spyOn(console,'error').mockImplementation(()=>{})
    expect(await processReviewAlerts(db as any, send)).toBe(1)
    expect(db.execute).toHaveBeenCalledTimes(1)
    expect(db.execute).toHaveBeenCalledWith(expect.any(String), ['c2'])
    vi.restoreAllMocks()
  })
})


it('leaves alerts pending when the run has no delivery budget', async () => {
  const db = {queryRows:vi.fn(async()=>[{id:'c1'}]), execute:vi.fn(async()=>1)}
  const send = vi.fn()
  expect(await processReviewAlerts(db as any, send, () => false)).toBe(0)
  expect(send).not.toHaveBeenCalled()
  expect(db.execute).not.toHaveBeenCalled()
})
