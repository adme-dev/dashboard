import { describe, it, expect, vi, beforeEach } from 'vitest'

const { loadLeadMock, notifyOnNewLeadMock, publishEventMock } = vi.hoisted(() => ({
  loadLeadMock: vi.fn(),
  notifyOnNewLeadMock: vi.fn(),
  publishEventMock: vi.fn()
}))

vi.mock('~~/server/utils/leads/db', () => ({ loadLead: loadLeadMock }))
vi.mock('~~/server/utils/leads/notifyOnNew', () => ({ notifyOnNewLead: notifyOnNewLeadMock }))
vi.mock('~~/server/utils/measurement/publisher', () => ({
  conversionOutboxPublisher: { publishEvent: publishEventMock }
}))

import { runPodiumPostCommit } from '../../server/utils/leads/podiumPostCommit'

const event = { context: {} } as any
const lead = { id: 'lead1' } as any

beforeEach(() => {
  vi.clearAllMocks()
  loadLeadMock.mockResolvedValue(lead)
  publishEventMock.mockResolvedValue(undefined)
})

describe('runPodiumPostCommit', () => {
  it('publishes the outbox event and notifies when outboxEventId is set', async () => {
    await runPodiumPostCommit(event, { leadId: 'lead1', outboxEventId: 'evt1' })
    expect(publishEventMock).toHaveBeenCalledWith(event, 'evt1')
    expect(loadLeadMock).toHaveBeenCalledWith('lead1')
    expect(notifyOnNewLeadMock).toHaveBeenCalledWith(lead)
  })

  it('skips publishing but still notifies when outboxEventId is null', async () => {
    await runPodiumPostCommit(event, { leadId: 'lead1', outboxEventId: null })
    expect(publishEventMock).not.toHaveBeenCalled()
    expect(notifyOnNewLeadMock).toHaveBeenCalledWith(lead)
  })

  it('does not notify when the lead cannot be reloaded', async () => {
    loadLeadMock.mockResolvedValue(null)
    await runPodiumPostCommit(event, { leadId: 'lead1', outboxEventId: null })
    expect(notifyOnNewLeadMock).not.toHaveBeenCalled()
  })
})
