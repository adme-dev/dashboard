import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
const transaction = vi.fn(async (callback: (db: { query: typeof query }) => Promise<unknown>) => callback({ query }))
vi.mock('~~/server/utils/db', () => ({ transaction: (...args: unknown[]) => transaction(...args) }))

const clientId = '11111111-1111-4111-8111-111111111111'
const actorId = '22222222-2222-4222-8222-222222222222'
const formId = 'email_endpoint:33333333-3333-4333-8333-333333333333'
const result = (rows: unknown[] = []) => ({ rows })

describe('email routing presets', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not create a rule when no preset was selected', async () => {
    const { applyEmailRoutingPreset } = await import('~~/server/utils/leads/emailRoutingPreset')

    await expect(applyEmailRoutingPreset({
      clientId,
      formId,
      formName: 'Carsales',
      preset: null
    }, actorId)).resolves.toEqual({ ruleId: null, destinationIds: [] })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('adds a single client-assigned owner destination without creating email-only CRM authority', async () => {
    const { applyEmailRoutingPreset } = await import('~~/server/utils/leads/emailRoutingPreset')
    query.mockResolvedValueOnce(result([{ allowed: true }]))
      .mockResolvedValueOnce(result([{ id: actorId }]))
      .mockResolvedValueOnce(result([{ id: 'rule-1' }]))
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(result([{ id: 'destination-1' }]))

    await expect(applyEmailRoutingPreset({
      clientId, formId, formName: 'Carsales', preset: 'assign_user', assignedUserId: actorId
    }, actorId)).resolves.toEqual({ ruleId: 'rule-1', destinationIds: ['destination-1'] })
    expect(query.mock.calls[4][1]).toEqual(['rule-1', 'assign_user', JSON.stringify({ user_id: actorId })])
  })

  it('rejects assignment to a user outside the endpoint client', async () => {
    const { applyEmailRoutingPreset } = await import('~~/server/utils/leads/emailRoutingPreset')
    query.mockResolvedValueOnce(result([{ allowed: true }])).mockResolvedValueOnce(result())
    await expect(applyEmailRoutingPreset({
      clientId, formId, formName: 'Carsales', preset: 'assign_user', assignedUserId: actorId
    }, actorId)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('reuses preset destinations without changing an operator-customised filter or delay', async () => {
    const { applyEmailRoutingPreset } = await import('~~/server/utils/leads/emailRoutingPreset')
    query.mockResolvedValueOnce(result([{ allowed: true }]))
      .mockResolvedValueOnce(result([{ id: 'rule-1' }]))
      .mockResolvedValueOnce(result([{ id: 'portal-existing' }]))

    await expect(applyEmailRoutingPreset({ clientId, formId, formName: 'Carsales', preset: 'portal' }, actorId))
      .resolves.toEqual({ ruleId: 'rule-1', destinationIds: ['portal-existing'] })
    expect(query.mock.calls).toHaveLength(3)
    expect(String(query.mock.calls[2][0])).not.toContain('UPDATE lead_rule_destinations')
  })
})
