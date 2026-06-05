import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addToList } from '~~/server/utils/email-marketing/db'

const queryOneMock = vi.fn()
const executeMock = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => queryOneMock(...args),
  execute: (...args: unknown[]) => executeMock(...args),
  queryRows: vi.fn(),
  queryCount: vi.fn()
}))

describe('email marketing db audit integration', () => {
  beforeEach(() => {
    queryOneMock.mockReset()
    executeMock.mockReset()
  })

  it('records imported consent provenance when adding an imported subscriber to a list', async () => {
    queryOneMock
      .mockResolvedValueOnce({ id: 'list-1', double_optin: false })
      .mockResolvedValueOnce({ email: 'person@example.com' })
    executeMock
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)

    await addToList('sub-1', 'list-1', 'import', {
      actorUserId: 'user-1',
      metadata: { filename: 'subscribers.csv', row: 4 }
    })

    const consentEventCall = executeMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO email_consent_events')
    )
    expect(consentEventCall?.[1]).toEqual([
      'sub-1',
      'person@example.com',
      'list-1',
      null,
      'imported',
      'import',
      'user-1',
      null,
      null,
      '{"filename":"subscribers.csv","row":4}'
    ])
  })

  it('does not reactivate previously unsubscribed memberships during imports', async () => {
    queryOneMock
      .mockResolvedValueOnce({ id: 'list-1', double_optin: false })
      .mockResolvedValueOnce({ email: 'person@example.com' })
    executeMock
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)

    await addToList('sub-1', 'list-1', 'import', {
      actorUserId: 'user-1',
      metadata: { filename: 'subscribers.csv', row: 4 }
    })

    const [sql, params] = executeMock.mock.calls[0] ?? []
    expect(String(sql)).toContain('WHEN subscriber_lists.status = \'unsubscribed\' AND $5::boolean')
    expect(String(sql)).toContain('WHEN subscriber_lists.status = \'unsubscribed\' AND NOT $5::boolean')
    expect(params).toEqual(['sub-1', 'list-1', 'confirmed', 'import', false])
  })
})
