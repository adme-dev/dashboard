import { describe, expect, it } from 'vitest'
import {
  enrollCatalogPilotMember,
  revokeCatalogPilotMember,
  type CatalogPilotMembership,
  type CatalogPilotMembershipRepository,
  type CatalogPilotMembershipTransaction,
  type CatalogPilotRelease
} from '~~/server/utils/ai/governance/catalogPilotMembership'

const RELEASE_ID = '10000000-0000-4000-8000-000000000001'
const DEPARTMENT_ID = '20000000-0000-4000-8000-000000000001'
const MEMBER_ID = '30000000-0000-4000-8000-000000000001'
const ACTOR_ID = '40000000-0000-4000-8000-000000000001'

function release(overrides: Partial<CatalogPilotRelease> = {}): CatalogPilotRelease {
  return {
    id: RELEASE_ID,
    kind: 'pack',
    departmentId: DEPARTMENT_ID,
    state: 'draft',
    rolloutScope: 'department',
    ...overrides
  }
}

function membership(overrides: Partial<CatalogPilotMembership> = {}): CatalogPilotMembership {
  return {
    id: '50000000-0000-4000-8000-000000000001',
    releaseId: RELEASE_ID,
    kind: 'pack',
    departmentId: DEPARTMENT_ID,
    memberUserId: MEMBER_ID,
    memberName: 'Pilot Member',
    assignedBy: ACTOR_ID,
    assignmentReason: 'Controlled finance pilot.',
    assignedAt: '2026-07-22T00:00:00.000Z',
    eligible: true,
    ...overrides
  }
}

class FakeRepository implements CatalogPilotMembershipRepository, CatalogPilotMembershipTransaction {
  currentRelease: CatalogPilotRelease | null
  eligible = true
  currentMembership: CatalogPilotMembership | null = null
  inserted: Parameters<CatalogPilotMembershipTransaction['insertMembership']>[0][] = []
  revoked: Parameters<CatalogPilotMembershipTransaction['revokeMembership']>[1][] = []

  constructor(currentRelease: CatalogPilotRelease | null = release()) {
    this.currentRelease = currentRelease
  }

  transaction<T>(callback: (tx: CatalogPilotMembershipTransaction) => Promise<T>): Promise<T> {
    return callback(this)
  }

  async lockRelease(kind: CatalogPilotRelease['kind'], releaseId: string) {
    return this.currentRelease?.kind === kind && this.currentRelease.id === releaseId
      ? { ...this.currentRelease }
      : null
  }

  async getEligibleDepartmentMember(departmentId: string, memberUserId: string) {
    return this.eligible && departmentId === DEPARTMENT_ID && memberUserId === MEMBER_ID
      ? { userId: MEMBER_ID, name: 'Pilot Member' }
      : null
  }

  async getActiveMembership() {
    return this.currentMembership ? { ...this.currentMembership } : null
  }

  async insertMembership(input: Parameters<CatalogPilotMembershipTransaction['insertMembership']>[0]) {
    this.inserted.push({ ...input })
    this.currentMembership = membership({
      kind: input.kind,
      releaseId: input.releaseId,
      departmentId: input.departmentId,
      memberUserId: input.memberUserId,
      memberName: input.memberName,
      assignedBy: input.actorUserId,
      assignmentReason: input.reason
    })
    return { ...this.currentMembership }
  }

  async revokeMembership(
    current: CatalogPilotMembership,
    input: Parameters<CatalogPilotMembershipTransaction['revokeMembership']>[1]
  ) {
    this.revoked.push({ ...input })
    this.currentMembership = null
    return { ...current }
  }
}

function request(overrides: Partial<Parameters<typeof enrollCatalogPilotMember>[0]> = {}) {
  return {
    kind: 'pack' as const,
    releaseId: RELEASE_ID,
    memberUserId: MEMBER_ID,
    actorUserId: ACTOR_ID,
    reason: 'Controlled finance pilot.',
    ...overrides
  }
}

describe('catalog pilot membership governance', () => {
  it('enrolls an active member of the exact release department without changing release state', async () => {
    const repository = new FakeRepository()

    const result = await enrollCatalogPilotMember(request(), repository)

    expect(result).toMatchObject({ created: true, membership: { memberUserId: MEMBER_ID } })
    expect(repository.inserted).toEqual([{
      kind: 'pack',
      releaseId: RELEASE_ID,
      departmentId: DEPARTMENT_ID,
      memberUserId: MEMBER_ID,
      memberName: 'Pilot Member',
      actorUserId: ACTOR_ID,
      reason: 'Controlled finance pilot.'
    }])
    expect(repository.currentRelease?.state).toBe('draft')
  })

  it('is idempotent when the member already has a live assignment', async () => {
    const repository = new FakeRepository(release({ state: 'pilot' }))
    repository.currentMembership = membership()

    await expect(enrollCatalogPilotMember(request(), repository)).resolves.toEqual({
      created: false,
      membership: membership()
    })
    expect(repository.inserted).toEqual([])
  })

  it('rejects a user outside the release department and releases that cannot be piloted', async () => {
    const nonMember = new FakeRepository()
    nonMember.eligible = false
    await expect(enrollCatalogPilotMember(request(), nonMember)).rejects.toMatchObject({
      code: 'pilot_member_ineligible',
      statusCode: 422
    })

    for (const state of ['active', 'retired'] as const) {
      await expect(enrollCatalogPilotMember(
        request(),
        new FakeRepository(release({ state }))
      )).rejects.toMatchObject({ code: 'pilot_release_state_invalid', statusCode: 409 })
    }
  })

  it('revokes the live assignment with actor and reason while preserving its history row', async () => {
    const repository = new FakeRepository(release({ state: 'pilot' }))
    repository.currentMembership = membership()

    const result = await revokeCatalogPilotMember(request(), repository)

    expect(result).toEqual({ removed: true, membership: membership() })
    expect(repository.revoked).toEqual([{ actorUserId: ACTOR_ID, reason: 'Controlled finance pilot.' }])
    expect(repository.currentMembership).toBeNull()
  })

  it('treats repeated revocation as an idempotent no-op', async () => {
    await expect(revokeCatalogPilotMember(request(), new FakeRepository(release({ state: 'pilot' }))))
      .resolves.toEqual({ removed: false, membership: null })
  })

  it('fails closed for a missing release and an invalid reason', async () => {
    await expect(enrollCatalogPilotMember(request(), new FakeRepository(null)))
      .rejects.toMatchObject({ code: 'pilot_release_not_found', statusCode: 404 })
    await expect(enrollCatalogPilotMember(request({ reason: '   ' }), new FakeRepository()))
      .rejects.toMatchObject({ code: 'invalid_reason', statusCode: 422 })
  })
})
