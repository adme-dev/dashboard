import { describe, expect, it, vi } from 'vitest'
import { dispatchPageStudioProvisioning } from '~~/server/utils/pageStudio/provisioningBinding'
import { createPageStudioSetupProposal } from '~~/server/utils/pageStudio/setupProposal'

const owner = '33333333-3333-4333-8333-333333333333'
const other = '44444444-4444-4444-8444-444444444444'
const input = () => ({
  initiatingUserId: owner,
  requestKey: 'page-studio-site_one-1',
  scope: { tenantId: 't1', clientId: 'c1', businessId: 'c1', siteId: 'site_one', environment: 'staging' as const },
  now: '2026-09-09T00:00:00.000Z', revision: 1, source: 'template' as const,
  plan: createPageStudioSetupProposal({ businessName: 'Customer Flowers', starterVersion: 'floristry-v1', setupSource: 'template' })
})

type Job = Awaited<ReturnType<typeof dispatchPageStudioProvisioning>>
type StoredJob = Omit<Job, 'actor'> & { actor?: Job['actor'] }

function coordinator() {
  let stored: StoredJob | null = null
  let loseResponse = false
  const binding = {
    readProvisioning: vi.fn(async () => stored),
    createProvisioning: vi.fn(async (input: unknown): Promise<unknown> => {
      const job = input as Job
      if (stored && JSON.stringify(stored.actor) !== JSON.stringify(job.actor)) throw new Error('Actor conflict')
      stored ??= job
      if (loseResponse) {
        loseResponse = false
        throw new Error('Response lost')
      }
      return stored
    })
  }
  return {
    binding, stored: () => stored,
    set: (value: StoredJob) => { stored = value },
    lose: () => { loseResponse = true }
  }
}

describe('authenticated provisioning actor', () => {
  it('derives the new actor from the trusted caller and preserves it for another editor retry', async () => {
    const s = coordinator()
    const first = await dispatchPageStudioProvisioning(s.binding, input())
    expect(first.actor).toEqual({ kind: 'client-user', userId: owner })
    expect(first).not.toHaveProperty('generationVersion')
    s.set({ ...first, phase: 'resources-created' })
    const replay = await dispatchPageStudioProvisioning(s.binding, { ...input(), initiatingUserId: other })
    expect(replay.actor).toEqual(first.actor)
    expect(replay.phase).toBe('resources-created')
    expect(s.binding.createProvisioning).toHaveBeenCalledOnce()
  })

  it('retains an agency actor through retries and rejects switching actor kind', async () => {
    const s = coordinator()
    const agency = { ...input(), initiatingActorKind: 'agency-user' as const }
    const first = await dispatchPageStudioProvisioning(s.binding, agency)
    expect(first.actor).toEqual({ kind: 'agency-user', userId: owner })
    const replay = await dispatchPageStudioProvisioning(s.binding, { ...agency, initiatingUserId: other })
    expect(replay.actor).toEqual(first.actor)
    await expect(dispatchPageStudioProvisioning(s.binding, input())).rejects.toMatchObject({ code: 'PROVISIONER_FAILED' })
    expect(s.binding.createProvisioning).toHaveBeenCalledOnce()
  })

  it('recovers a lost response without changing the saved actor', async () => {
    const s = coordinator()
    s.lose()
    const saved = await dispatchPageStudioProvisioning(s.binding, input())
    expect(saved.actor.userId).toBe(owner)
    expect(s.binding.createProvisioning).toHaveBeenCalledOnce()
    expect(s.binding.readProvisioning).toHaveBeenCalledTimes(2)
  })

  it('converges concurrent first requests on one immutable actor', async () => {
    const s = coordinator()
    const results = await Promise.all([
      dispatchPageStudioProvisioning(s.binding, input()),
      dispatchPageStudioProvisioning(s.binding, { ...input(), initiatingUserId: other })
    ])
    expect(results[0].actor).toEqual(results[1].actor)
    expect(results[0].actor).toEqual(s.stored()?.actor)
    expect(results[0].actor.userId).toBe(owner)
  })

  it('does not add an actor to a historical job or dispatch a changed accepted plan', async () => {
    const s = coordinator()
    const first = await dispatchPageStudioProvisioning(s.binding, input())
    const { actor: _actor, ...historical } = first
    s.set(historical)
    await expect(dispatchPageStudioProvisioning(s.binding, input())).rejects.toMatchObject({ code: 'PROVISIONING_OWNER_REQUIRED', statusCode: 409 })
    s.set(first)
    await expect(dispatchPageStudioProvisioning(s.binding, { ...input(), plan: { ...input().plan, pages: ['changed'] } })).rejects.toThrow('mismatched')
    expect(s.binding.createProvisioning).toHaveBeenCalledOnce()
  })

  it('rejects an invalid initiating identity before any service access', async () => {
    const s = coordinator()
    await expect(dispatchPageStudioProvisioning(s.binding, { ...input(), initiatingUserId: 'untrusted' })).rejects.toMatchObject({ statusCode: 422 })
    expect(s.binding.readProvisioning).not.toHaveBeenCalled()
    expect(s.binding.createProvisioning).not.toHaveBeenCalled()
  })

  it.each(['id', 'actor', 'plan', 'setup', 'resources', 'scope', 'generationVersion', 'unknown'])('rejects a malformed or mismatched %s acknowledgement', async (field) => {
    const s = coordinator()
    s.binding.createProvisioning.mockImplementationOnce(async (input) => {
      const job = input as Job
      if (field === 'id') return { ...job, id: 'foreign' }
      if (field === 'actor') return { ...job, actor: { kind: 'client-user', userId: other } }
      if (field === 'plan') return { ...job, plan: { ...job.plan, scope: { ...job.scope, tenantId: 'foreign' } } }
      if (field === 'setup') return { ...job, setup: { ...job.setup, proposalRevision: 2 } }
      if (field === 'resources') return { ...job, resources: {} }
      if (field === 'scope') return { ...job, scope: { ...job.scope, tenantId: 'foreign' } }
      if (field === 'generationVersion') return { ...job, generationVersion: 2 }
      return { ...job, unknown: true }
    })
    await expect(dispatchPageStudioProvisioning(s.binding, input())).rejects.toMatchObject({ code: 'PROVISIONER_FAILED', statusCode: 503 })
    // A malformed success is not treated as a lost response.
    expect(s.binding.readProvisioning).toHaveBeenCalledOnce()
  })

  it('does not create when the preflight read fails or the read capability is missing', async () => {
    const s = coordinator()
    s.binding.readProvisioning.mockRejectedValueOnce(new Error('Unavailable'))
    await expect(dispatchPageStudioProvisioning(s.binding, input())).rejects.toMatchObject({ code: 'PROVISIONER_FAILED' })
    await expect(dispatchPageStudioProvisioning({ createProvisioning: s.binding.createProvisioning }, input())).rejects.toMatchObject({ code: 'PROVISIONER_UNAVAILABLE' })
    expect(s.binding.createProvisioning).not.toHaveBeenCalled()
  })

  it('fails when an unsuccessful create has no matching durable request', async () => {
    const s = coordinator()
    s.binding.createProvisioning.mockRejectedValueOnce(new Error('Create failed'))
    await expect(dispatchPageStudioProvisioning(s.binding, input())).rejects.toMatchObject({ code: 'PROVISIONER_FAILED' })
    expect(s.binding.readProvisioning).toHaveBeenCalledTimes(2)
    expect(s.binding.createProvisioning).toHaveBeenCalledOnce()
  })
})
