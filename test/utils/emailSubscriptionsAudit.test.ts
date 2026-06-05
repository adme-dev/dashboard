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

  it('records form_submitted consent history for public form subscribe', async () => {
    const dbQueryMock = vi.fn()
    queryOneMock.mockResolvedValueOnce({ id: 'list-1', name: 'Retail News', double_optin: true })
    transactionMock.mockImplementationOnce(async (cb: (db: { query: typeof dbQueryMock }) => Promise<unknown>) => cb({ query: dbQueryMock }))
    dbQueryMock
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1', status: 'enabled' }] })
      .mockResolvedValueOnce({ rows: [{ status: 'unconfirmed' }] })
      .mockResolvedValueOnce({ rowCount: 1 })

    const result = await subscribePublic({
      email: 'person@example.com',
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
})
