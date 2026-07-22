import { describe, expect, it } from 'vitest'
import {
  DepartmentDraftPackSeedError,
  seedDepartmentDraftPack,
  type DepartmentDraftPackSeedRepository,
  type DepartmentDraftPackSeedTransaction,
  type ExistingDepartmentDraftPack
} from '~~/server/utils/ai/governance/departmentDraftPackSeeder'

const DEPARTMENT_ID = '10000000-0000-4000-8000-000000000001'
const OWNER_ID = '20000000-0000-4000-8000-000000000001'
const ACTOR_ID = '30000000-0000-4000-8000-000000000001'

class FakeRepository implements DepartmentDraftPackSeedRepository, DepartmentDraftPackSeedTransaction {
  existing: ExistingDepartmentDraftPack | null = null
  ownerContext = {
    department: { id: DEPARTMENT_ID, name: 'Creative', slug: 'creative', isOrganizational: true, isActive: true },
    owner: { id: OWNER_ID, name: 'Creative Manager', isActive: true, isDepartmentMember: true }
  }

  calls: Array<{ method: string, value?: unknown }> = []
  id = 0

  nextId() {
    this.id += 1
    return `40000000-0000-4000-8000-${this.id.toString().padStart(12, '0')}`
  }

  transaction<T>(callback: (tx: DepartmentDraftPackSeedTransaction) => Promise<T>) {
    return callback(this)
  }

  async lockSeed(departmentId: string, packKey: string) {
    this.calls.push({ method: 'lockSeed', value: { departmentId, packKey } })
  }

  async getOwnerContext() { return structuredClone(this.ownerContext) }
  async findExistingPack() { return this.existing ? structuredClone(this.existing) : null }

  async insertEvaluationSuite(value: unknown) {
    this.calls.push({ method: 'insertEvaluationSuite', value })
    return this.nextId()
  }

  async insertEvaluationSuiteVersion(value: unknown) {
    this.calls.push({ method: 'insertEvaluationSuiteVersion', value })
    return this.nextId()
  }

  async insertEvaluationCase(value: unknown) {
    this.calls.push({ method: 'insertEvaluationCase', value })
    return this.nextId()
  }

  async insertPack(value: unknown) {
    this.calls.push({ method: 'insertPack', value })
    return this.nextId()
  }

  async insertPackVersion(value: unknown) {
    this.calls.push({ method: 'insertPackVersion', value })
    return this.nextId()
  }

  async insertCapability(value: unknown) {
    this.calls.push({ method: 'insertCapability', value })
    return this.nextId()
  }

  async insertCapabilityVersion(value: unknown) {
    this.calls.push({ method: 'insertCapabilityVersion', value })
    return this.nextId()
  }

  async insertToolBinding(value: unknown) { this.calls.push({ method: 'insertToolBinding', value }) }
  async linkPackCapability(value: unknown) { this.calls.push({ method: 'linkPackCapability', value }) }

  async insertCapabilityRelease(value: unknown) {
    this.calls.push({ method: 'insertCapabilityRelease', value })
    return this.nextId()
  }

  async insertPackRelease(value: unknown) {
    this.calls.push({ method: 'insertPackRelease', value })
    return this.nextId()
  }

  async appendAudit(value: unknown) { this.calls.push({ method: 'appendAudit', value }) }
}

function request() {
  return {
    blueprintKey: 'creative' as const,
    departmentId: DEPARTMENT_ID,
    ownerUserId: OWNER_ID,
    actorUserId: ACTOR_ID,
    reason: 'Owner confirmed for the first read/draft evaluation cycle.'
  }
}

describe('department draft pack seeder', () => {
  it('atomically creates immutable evaluation material and draft-only releases', async () => {
    const repository = new FakeRepository()

    const result = await seedDepartmentDraftPack(request(), repository)

    expect(result).toMatchObject({
      outcome: 'created',
      blueprintKey: 'creative',
      departmentId: DEPARTMENT_ID,
      ownerUserId: OWNER_ID,
      releaseState: 'draft',
      version: 1,
      evaluationCaseCount: 3
    })
    expect(result.materialDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(repository.calls[0]).toMatchObject({ method: 'lockSeed' })
    expect(repository.calls.filter(call => call.method === 'insertEvaluationCase')).toHaveLength(3)
    expect(repository.calls.filter(call => call.method === 'insertCapability')).toHaveLength(2)
    expect(repository.calls.filter(call => call.method === 'insertCapabilityRelease'))
      .toHaveLength(2)
    expect(repository.calls.filter(call => call.method === 'appendAudit')).toHaveLength(4)
    expect(repository.calls.filter(call => call.method.endsWith('Release')).every(call =>
      (call.value as { releaseState: string }).releaseState === 'draft'
    )).toBe(true)
  })

  it('rejects inactive, non-member, or mismatched owners before any insert', async () => {
    for (const [label, mutate, code] of [
      ['inactive owner', (repo: FakeRepository) => { repo.ownerContext.owner.isActive = false }, 'owner_inactive'],
      ['non-member owner', (repo: FakeRepository) => { repo.ownerContext.owner.isDepartmentMember = false }, 'owner_not_member'],
      ['wrong department', (repo: FakeRepository) => {
        repo.ownerContext.department.name = 'Marketing'
        repo.ownerContext.department.slug = 'marketing'
      }, 'department_blueprint_mismatch']
    ] as const) {
      const repository = new FakeRepository()
      mutate(repository)

      await expect(seedDepartmentDraftPack(request(), repository)).rejects.toMatchObject({ code })
      expect(repository.calls.map(call => call.method)).toEqual(['lockSeed'])
      expect(label).toBeTruthy()
    }
  })

  it('returns an exact existing draft idempotently and rejects conflicting material', async () => {
    const firstRepository = new FakeRepository()
    const first = await seedDepartmentDraftPack(request(), firstRepository)
    const existing: ExistingDepartmentDraftPack = {
      packId: first.packId,
      packVersionId: first.packVersionId,
      packReleaseId: first.packReleaseId,
      ownerUserId: OWNER_ID,
      version: 1,
      materialDigest: first.materialDigest,
      releaseState: 'draft'
    }
    const retryRepository = new FakeRepository()
    retryRepository.existing = existing

    await expect(seedDepartmentDraftPack(request(), retryRepository)).resolves.toMatchObject({
      outcome: 'already_exists',
      packId: first.packId,
      materialDigest: first.materialDigest
    })
    expect(retryRepository.calls.map(call => call.method)).toEqual(['lockSeed'])

    for (const conflict of [
      { ...existing, ownerUserId: '20000000-0000-4000-8000-000000000099' },
      { ...existing, materialDigest: 'f'.repeat(64) },
      { ...existing, releaseState: 'pilot' as const }
    ]) {
      const repository = new FakeRepository()
      repository.existing = conflict
      await expect(seedDepartmentDraftPack(request(), repository)).rejects.toMatchObject({
        code: 'draft_pack_conflict',
        statusCode: 409
      })
    }
  })

  it('validates identifiers and reasons at the service boundary', async () => {
    await expect(seedDepartmentDraftPack({ ...request(), departmentId: 'invalid' }, new FakeRepository()))
      .rejects.toBeInstanceOf(DepartmentDraftPackSeedError)
    await expect(seedDepartmentDraftPack({ ...request(), reason: '  ' }, new FakeRepository()))
      .rejects.toMatchObject({ code: 'invalid_seed_request', statusCode: 422 })
  })
})
