import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  confirmSubscription,
  globalUnsubscribe,
  setListSubscription,
  subscribePublic
} from '~~/server/utils/email-marketing/subscriptions'

const queryOneMock = vi.fn()
const transactionMock = vi.fn()
const executeMock = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => queryOneMock(...args),
  transaction: (cb: unknown) => transactionMock(cb),
  queryRows: vi.fn(),
  execute: (...args: unknown[]) => executeMock(...args)
}))

describe('email subscription audit integration', () => {
  beforeEach(() => {
    queryOneMock.mockReset()
    transactionMock.mockReset()
    executeMock.mockReset()
  })

  it('records suppression and consent history for one-click global unsubscribe', async () => {
    const dbQueryMock = vi.fn()
    queryOneMock.mockResolvedValueOnce({ email: 'person@example.com' })
    transactionMock.mockImplementationOnce(async (cb: (db: { query: typeof dbQueryMock }) => Promise<unknown>) => cb({ query: dbQueryMock }))
    dbQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })

    const result = await globalUnsubscribe({ subscriberId: 'sub-1', campaignId: 'camp-1' })

    expect(result).toEqual({ email: 'person@example.com' })
    const suppressionEventCall = dbQueryMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO suppression_events')
    )
    expect(suppressionEventCall?.[1]).toEqual([
      'person@example.com',
      'sub-1',
      'camp-1',
      'global_unsubscribe',
      'added',
      'one_click',
      null,
      '{}'
    ])
    const consentEventCall = dbQueryMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO email_consent_events')
    )
    expect(consentEventCall?.[1]).toEqual([
      'sub-1',
      'person@example.com',
      null,
      'camp-1',
      'global_unsubscribed',
      'one_click',
      null,
      null,
      null,
      '{}'
    ])
  })

  it('upgrades one-click unsubscribe over an existing soft-bounce suppression', async () => {
    const dbQueryMock = vi.fn()
    queryOneMock.mockResolvedValueOnce({ email: 'person@example.com' })
    transactionMock.mockImplementationOnce(async (cb: (db: { query: typeof dbQueryMock }) => Promise<unknown>) => cb({ query: dbQueryMock }))
    dbQueryMock
      .mockResolvedValueOnce({ rows: [{ reason: 'soft_bounce' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })

    await globalUnsubscribe({ subscriberId: 'sub-1', campaignId: 'camp-1' })

    const suppressionUpsertCall = dbQueryMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO suppression_list')
    )
    expect(String(suppressionUpsertCall?.[0])).toContain('DO UPDATE')
    expect(String(suppressionUpsertCall?.[0])).toContain('suppression_list.reason = \'soft_bounce\'')
    const suppressionEventCall = dbQueryMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO suppression_events')
    )
    expect(suppressionEventCall?.[1]).toEqual([
      'person@example.com',
      'sub-1',
      'camp-1',
      'global_unsubscribe',
      'updated',
      'one_click',
      null,
      '{"previousReason":"soft_bounce"}'
    ])
  })

  it('normalizes email while recording form_submitted consent history for public form subscribe', async () => {
    const dbQueryMock = vi.fn()
    queryOneMock.mockResolvedValueOnce({ id: 'list-1', name: 'Retail News', double_optin: true })
    transactionMock.mockImplementationOnce(async (cb: (db: { query: typeof dbQueryMock }) => Promise<unknown>) => cb({ query: dbQueryMock }))
    dbQueryMock
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1', status: 'enabled' }] })
      .mockResolvedValueOnce({ rows: [{ status: 'unconfirmed' }] })
      .mockResolvedValueOnce({ rowCount: 1 })

    const result = await subscribePublic({
      email: ' Person@Example.COM ',
      name: 'Person',
      listId: 'list-1',
      source: 'form'
    })

    expect(result).toMatchObject({
      subscriberId: 'sub-1',
      listId: 'list-1',
      status: 'unconfirmed',
      needsConfirm: true
    })
    expect(dbQueryMock.mock.calls[0]?.[1]).toEqual(['person@example.com', 'Person'])
    const consentEventCall = dbQueryMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO email_consent_events')
    )
    expect(consentEventCall?.[1]).toEqual([
      'sub-1',
      'person@example.com',
      'list-1',
      null,
      'form_submitted',
      'form',
      null,
      null,
      null,
      '{}'
    ])
  })

  it('records confirmed consent history for double opt-in confirmation', async () => {
    const dbQueryMock = vi.fn()
    transactionMock.mockImplementationOnce(async (cb: (db: { query: typeof dbQueryMock }) => Promise<unknown>) => cb({ query: dbQueryMock }))
    dbQueryMock
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ email: 'person@example.com' }] })
      .mockResolvedValueOnce({ rowCount: 1 })

    const confirmed = await confirmSubscription({ subscriberId: 'sub-1', listId: 'list-1' })

    expect(confirmed).toBe(true)
    const consentEventCall = dbQueryMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO email_consent_events')
    )
    expect(consentEventCall?.[1]).toEqual([
      'sub-1',
      'person@example.com',
      'list-1',
      null,
      'confirmed',
      'form',
      null,
      null,
      null,
      '{}'
    ])
  })

  it('records suppression removal history when double opt-in confirmation lifts global unsubscribe', async () => {
    const dbQueryMock = vi.fn()
    transactionMock.mockImplementationOnce(async (cb: (db: { query: typeof dbQueryMock }) => Promise<unknown>) => cb({ query: dbQueryMock }))
    dbQueryMock
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ email: 'person@example.com' }] })
      .mockResolvedValueOnce({ rowCount: 1 })

    const confirmed = await confirmSubscription({ subscriberId: 'sub-1', listId: 'list-1' })

    expect(confirmed).toBe(true)
    const suppressionEventCall = dbQueryMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO suppression_events')
    )
    expect(suppressionEventCall?.[1]).toEqual([
      'person@example.com',
      'sub-1',
      null,
      'global_unsubscribe',
      'removed',
      'form',
      null,
      '{}'
    ])
  })

  it('records list_unsubscribed consent history for preference-center unsubscribe', async () => {
    const dbQueryMock = vi.fn()
    executeMock.mockResolvedValueOnce(1)
    transactionMock.mockImplementationOnce(async (cb: (db: { query: typeof dbQueryMock }) => Promise<unknown>) => cb({ query: dbQueryMock }))
    dbQueryMock
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ email: 'person@example.com' }] })
      .mockResolvedValueOnce({ rowCount: 1 })

    const changed = await setListSubscription({
      subscriberId: 'sub-1',
      listId: 'list-1',
      subscribe: false
    })

    expect(changed).toBe(true)
    const consentEventCall = dbQueryMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO email_consent_events')
    )
    expect(consentEventCall?.[1]).toEqual([
      'sub-1',
      'person@example.com',
      'list-1',
      null,
      'list_unsubscribed',
      'preference_center',
      null,
      null,
      null,
      '{}'
    ])
  })

  it('records resubscribe consent and suppression removal history for preference-center subscribe', async () => {
    const dbQueryMock = vi.fn()
    transactionMock.mockImplementationOnce(async (cb: (db: { query: typeof dbQueryMock }) => Promise<unknown>) => cb({ query: dbQueryMock }))
    dbQueryMock
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ email: 'person@example.com' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })

    const changed = await setListSubscription({
      subscriberId: 'sub-1',
      listId: 'list-1',
      subscribe: true
    })

    expect(changed).toBe(true)
    const consentEventCall = dbQueryMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO email_consent_events')
    )
    expect(consentEventCall?.[1]).toEqual([
      'sub-1',
      'person@example.com',
      'list-1',
      null,
      'resubscribed',
      'preference_center',
      null,
      null,
      null,
      '{}'
    ])
    const suppressionEventCall = dbQueryMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO suppression_events')
    )
    expect(suppressionEventCall?.[1]).toEqual([
      'person@example.com',
      'sub-1',
      null,
      'global_unsubscribe',
      'removed',
      'preference_center',
      null,
      '{}'
    ])
  })

  it('does not lift global suppression when preference-center subscribe matches no membership', async () => {
    const dbQueryMock = vi.fn()
    transactionMock.mockImplementationOnce(async (cb: (db: { query: typeof dbQueryMock }) => Promise<unknown>) => cb({ query: dbQueryMock }))
    dbQueryMock
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ email: 'person@example.com' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })

    const changed = await setListSubscription({
      subscriberId: 'sub-1',
      listId: 'not-a-membership',
      subscribe: true
    })

    expect(changed).toBe(false)
    expect(dbQueryMock.mock.calls.some(([sql]) =>
      String(sql).includes('DELETE FROM suppression_list')
    )).toBe(false)
    expect(dbQueryMock.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO suppression_events')
    )).toBe(false)
  })

  it('limits preference-center subscribe updates to non-archived list memberships', async () => {
    const dbQueryMock = vi.fn()
    transactionMock.mockImplementationOnce(async (cb: (db: { query: typeof dbQueryMock }) => Promise<unknown>) => cb({ query: dbQueryMock }))
    dbQueryMock.mockResolvedValueOnce({ rowCount: 0 })

    await setListSubscription({
      subscriberId: 'sub-1',
      listId: 'list-1',
      subscribe: true
    })

    const sql = String(dbQueryMock.mock.calls[0]?.[0])
    expect(sql).toContain('email_lists')
    expect(sql).toContain('archived_at IS NULL')
  })

  it('limits preference-center unsubscribe updates to non-archived list memberships', async () => {
    const dbQueryMock = vi.fn()
    transactionMock.mockImplementationOnce(async (cb: (db: { query: typeof dbQueryMock }) => Promise<unknown>) => cb({ query: dbQueryMock }))
    dbQueryMock.mockResolvedValueOnce({ rowCount: 0 })

    await setListSubscription({
      subscriberId: 'sub-1',
      listId: 'list-1',
      subscribe: false
    })

    const sql = String(dbQueryMock.mock.calls[0]?.[0])
    expect(sql).toContain('email_lists')
    expect(sql).toContain('archived_at IS NULL')
  })
})
