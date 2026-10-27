import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CloudExecutionController } from '../../workers/banner-engine/cloud/controller'
import type { AttemptIdentity, Evidence, Generation, Storage, Transaction, TrustedAdapter } from '../../workers/banner-engine/cloud/contracts'

// Local disk-backed transactional model; not a simulation of workerd input/output gates.
class DiskStorage implements Storage {
  db: DatabaseSync
  tail: Promise<unknown> = Promise.resolve()
  failCommit = false
  failSync = false
  constructor(readonly path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  }

  async get<T>(key: string): Promise<T | undefined> {
    const row = this.db.prepare('SELECT value FROM kv WHERE key=?').get(key)
    return row ? JSON.parse(String(row.value)) : undefined
  }

  transaction<T>(body: (tx: Transaction) => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      this.db.exec('BEGIN IMMEDIATE')
      try {
        const result = await body({ get: this.get.bind(this), put: async (key, value) => {
          this.db.prepare('INSERT OR REPLACE INTO kv VALUES (?,?)').run(key, JSON.stringify(value))
        } })
        if (this.failCommit) throw new Error('commit failed')
        this.db.exec('COMMIT')
        return result
      } catch (error) {
        this.db.exec('ROLLBACK')
        throw error
      }
    })
    this.tail = run.catch(() => {})
    return run
  }

  async sync() { if (this.failSync) throw new Error('crash after commit') }
}

const hash = (value: string) => `sha256:${value.repeat(64)}`
const generation: Generation = {
  generationId: 'generation-1', bootId: 'boot-1', outerImageDigest: hash('a'), innerImageDigest: hash('b')
}
const identity: AttemptIdentity = {
  ...generation, jobId: 'job-1', attemptId: 'attempt-1', capabilityId: 'photocraft-preview-v1',
  capabilityDigest: hash('c'), payloadDigest: hash('d'), innerContainerId: 'inner-1'
}
const evidence = (id = identity): Evidence => ({
  identity: id,
  authority: { status: 'succeeded', receiptDigest: hash('e') },
  native: { status: 'succeeded', receiptDigest: hash('f') },
  output: { status: 'accepted', receiptDigest: hash('1') },
  cleanup: { innerTerminated: true, scratchRemoved: true, deliveryFenced: true, receiptDigest: hash('2') }
})
const paths: string[] = []
const databases: DiskStorage[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.db.close()
  for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true })
})
async function fixture(enabled = true) {
  const directory = mkdtempSync(join(tmpdir(), 'engine-cloud-'))
  paths.push(directory)
  const storage = new DiskStorage(join(directory, 'state.sqlite'))
  databases.push(storage)
  const adapter: TrustedAdapter = {
    authorize: vi.fn(async request => request),
    verifyGeneration: vi.fn(async () => true),
    verifyTermination: vi.fn(async () => true),
    verifyEvidence: vi.fn(async () => true),
    forward: vi.fn(async () => undefined)
  }
  const controller = new CloudExecutionController(storage, adapter, enabled)
  if (enabled) await controller.registerGeneration(generation)
  return { storage, adapter, controller }
}

describe('cloud durable execution control (local SQLite model)', () => {
  it('is disabled unless explicitly enabled', async () => {
    const { storage, adapter } = await fixture(false)
    const controller = new CloudExecutionController(storage, adapter)
    await expect(controller.execute(identity)).rejects.toThrow('disabled')
    expect(adapter.forward).not.toHaveBeenCalled()
  })

  it('commits consumption and the aggregate slot before forwarding', async () => {
    const { controller, adapter } = await fixture()
    vi.mocked(adapter.forward).mockImplementation(async () => {
      expect((await controller.readAttempt(identity.jobId, identity.attemptId))?.state).toBe('consumed')
      expect((await controller.readSlot()).attempt).toEqual(identity)
    })
    await controller.execute(identity)
    expect(adapter.forward).toHaveBeenCalledTimes(1)
  })

  it('concurrent duplicate deliveries forward once, and both engines share one slot', async () => {
    const { controller, adapter } = await fixture()
    await Promise.all(Array.from({ length: 12 }, () => controller.execute(identity)))
    expect(adapter.forward).toHaveBeenCalledTimes(1)
    await expect(controller.execute({ ...identity, jobId: 'job-2', attemptId: 'attempt-2', capabilityId: 'vectorcraft-preview-v1', innerContainerId: 'inner-2' })).rejects.toThrow('slot-held')
  })

  it('a failed durable transaction never forwards or partially consumes', async () => {
    const { controller, adapter, storage } = await fixture()
    storage.failCommit = true
    await expect(controller.execute(identity)).rejects.toThrow('commit failed')
    expect(await controller.readAttempt(identity.jobId, identity.attemptId)).toBeUndefined()
    expect((await controller.readSlot()).attempt).toBeNull()
    expect(adapter.forward).not.toHaveBeenCalled()
  })

  it('crash after commit before delivery stays consumed after reconstructing the controller', async () => {
    const { controller, adapter, storage } = await fixture()
    storage.failSync = true
    await expect(controller.execute(identity)).rejects.toThrow('crash after commit')
    const reopened = new DiskStorage(storage.path)
    databases.push(reopened)
    const restarted = new CloudExecutionController(reopened, adapter, true)
    expect((await restarted.execute(identity)).state).toBe('consumed')
    expect((await restarted.readSlot()).attempt).toEqual(identity)
    expect(adapter.forward).not.toHaveBeenCalled()
  })

  it('lost forward acknowledgement holds and replay never forwards again', async () => {
    const { controller, adapter, storage } = await fixture()
    vi.mocked(adapter.forward).mockRejectedValue(new Error('lost acknowledgement with secret payload'))
    const first = await controller.execute(identity)
    expect(first.state).toBe('uncertain')
    const restarted = new CloudExecutionController(storage, adapter, true)
    expect(await restarted.execute(identity)).toEqual(first)
    expect(JSON.stringify(first)).not.toContain('secret')
    expect(adapter.forward).toHaveBeenCalledTimes(1)
    expect((await restarted.readSlot()).attempt).toEqual(identity)
  })

  it.each(Object.keys(identity))('rejects changed %s on replay', async (field) => {
    const { controller } = await fixture()
    await controller.execute(identity)
    const altered = { ...identity, [field]: field.includes('Digest') ? hash('9') : 'changed' }
    // A new job or attempt is a distinct identity, but still cannot obtain the held slot.
    await expect(controller.execute(altered)).rejects.toThrow()
  })

  it('rejects an untrusted capability or payload before consumption', async () => {
    const { controller, adapter } = await fixture()
    vi.mocked(adapter.authorize).mockResolvedValue({ ...identity, payloadDigest: hash('9') })
    await expect(controller.execute(identity)).rejects.toThrow('authority-mismatch')
    expect(adapter.forward).not.toHaveBeenCalled()
    expect((await controller.readSlot()).attempt).toBeNull()
  })

  it('persists all four facts before release and replays recorded outcome after release', async () => {
    const { controller, adapter } = await fixture()
    await controller.execute(identity)
    const receipt = evidence()
    const recorded = await controller.recordEvidence(receipt)
    expect(recorded.state).toBe('settled')
    expect(recorded.evidence).toEqual(receipt)
    expect((await controller.readSlot()).attempt).toBeNull()
    expect(await controller.execute(identity)).toEqual(recorded)
    expect(adapter.forward).toHaveBeenCalledTimes(1)
    await expect(controller.recordEvidence({ ...receipt, native: { status: 'failed', receiptDigest: hash('3') } })).rejects.toThrow('evidence-conflict')
  })

  it('failed settlement commit keeps the slot and outcome unchanged', async () => {
    const { controller, storage } = await fixture()
    await controller.execute(identity)
    storage.failCommit = true
    await expect(controller.recordEvidence(evidence())).rejects.toThrow('commit failed')
    expect((await controller.readSlot()).attempt).toEqual(identity)
    expect((await controller.readAttempt(identity.jobId, identity.attemptId))?.evidence).toBeUndefined()
  })

  it('rejects missing cleanup, forged evidence and cross-boot evidence', async () => {
    const { controller, adapter } = await fixture()
    await controller.execute(identity)
    const incomplete = evidence()
    incomplete.cleanup.deliveryFenced = false as true
    await expect(controller.recordEvidence(incomplete)).rejects.toThrow()
    await expect(controller.recordEvidence(evidence({ ...identity, bootId: 'wrong-boot' }))).rejects.toThrow()
    vi.mocked(adapter.verifyEvidence).mockResolvedValue(false)
    await expect(controller.recordEvidence(evidence())).rejects.toThrow('untrusted-evidence')
    expect((await controller.readSlot()).attempt).toEqual(identity)
  })

  it('a replacement boot requires explicit verified old termination, even when idle', async () => {
    const { controller, adapter } = await fixture()
    const next = { ...generation, generationId: 'generation-2', bootId: 'boot-2' }
    await expect(controller.registerGeneration(next)).rejects.toThrow('termination-required')
    const termination = { generation, terminated: true as const, deliveryFenced: true as const, scratchRemoved: true as const, receiptDigest: hash('4') }
    vi.mocked(adapter.verifyTermination).mockResolvedValue(false)
    await expect(controller.registerGeneration(next, termination)).rejects.toThrow('untrusted-termination')
    vi.mocked(adapter.verifyTermination).mockResolvedValue(true)
    await controller.registerGeneration(next, termination)
    await expect(controller.registerGeneration(generation, { ...termination, generation: next })).rejects.toThrow('generation-reused')
    await expect(controller.execute(identity)).rejects.toThrow('generation-mismatch')
  })

  it('positive generation termination alone cannot release an unsettled attempt', async () => {
    const { controller } = await fixture()
    await controller.execute(identity)
    await expect(controller.registerGeneration({ ...generation, generationId: 'generation-2', bootId: 'boot-2' }, {
      generation, terminated: true, deliveryFenced: true, scratchRemoved: true, receiptDigest: hash('4')
    })).rejects.toThrow('slot-held')
    expect((await controller.readSlot()).attempt).toEqual(identity)
  })

  it('late transport failure cannot regress settled evidence or clear the next slot', async () => {
    const { controller, adapter } = await fixture()
    let rejectForward!: (error: Error) => void
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    vi.mocked(adapter.forward).mockImplementationOnce(async () => {
      entered()
      await new Promise<void>((_resolve, reject) => {
        rejectForward = reject
      })
    })
    const original = controller.execute(identity)
    await started
    const settled = await controller.recordEvidence(evidence())
    const next = { ...identity, jobId: 'job-2', attemptId: 'attempt-2', innerContainerId: 'inner-2' }
    await controller.execute(next)
    rejectForward(new Error('late lost acknowledgement'))
    expect(await original).toEqual(settled)
    expect((await controller.readSlot()).attempt).toEqual(next)
    expect(await controller.recordEvidence(evidence())).toEqual(settled)
    expect((await controller.readSlot()).attempt).toEqual(next)
  })

  it('replays and records recovery evidence while new admission is disabled', async () => {
    const { controller, adapter, storage } = await fixture()
    await controller.execute(identity)
    const disabled = new CloudExecutionController(storage, adapter)
    expect((await disabled.execute(identity)).state).toBe('delivered')
    await expect(disabled.execute({ ...identity, attemptId: 'new' })).rejects.toThrow('disabled')
    await disabled.recordEvidence(evidence())
    expect((await disabled.execute(identity)).state).toBe('settled')
    expect(adapter.forward).toHaveBeenCalledTimes(1)
  })

  it('permanently retains inner-container identity consumption after release', async () => {
    const { controller } = await fixture()
    await controller.execute(identity)
    await controller.recordEvidence(evidence())
    await expect(controller.execute({ ...identity, attemptId: 'attempt-2' })).rejects.toThrow('inner-identity-reused')
  })

  it('concurrent different jobs cannot both obtain the aggregate slot', async () => {
    const { controller, adapter } = await fixture()
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => controller.execute({
      ...identity, jobId: `job-${index}`, attemptId: `attempt-${index}`, innerContainerId: `inner-${index}`
    })))
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    expect(adapter.forward).toHaveBeenCalledTimes(1)
  })

  it('rechecks generation in the consume transaction after slow authorization', async () => {
    const { controller, adapter } = await fixture()
    let authorized!: (value: AttemptIdentity) => void
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    vi.mocked(adapter.authorize).mockImplementation(() => {
      entered()
      return new Promise((resolve) => {
        authorized = resolve
      })
    })
    const execution = controller.execute(identity)
    await started
    await controller.registerGeneration({ ...generation, generationId: 'generation-2', bootId: 'boot-2' }, {
      generation, terminated: true, deliveryFenced: true, scratchRemoved: true, receiptDigest: hash('4')
    })
    authorized(identity)
    await expect(execution).rejects.toThrow('generation-mismatch')
    expect(adapter.forward).not.toHaveBeenCalled()
  })

  it('cannot replace a boot using evidence for a different prior generation', async () => {
    const { controller } = await fixture()
    await expect(controller.registerGeneration({ ...generation, generationId: 'generation-2', bootId: 'boot-2' }, {
      generation: { ...generation, bootId: 'another-boot' }, terminated: true,
      deliveryFenced: true, scratchRemoved: true, receiptDigest: hash('4')
    })).rejects.toThrow('termination-required')
  })

  it('fails closed for extra executable, token, image-tag, or malformed identity fields', async () => {
    const { controller, adapter } = await fixture()
    for (const untrusted of [
      { ...identity, executable: '/bin/sh' }, { ...identity, token: 'must-not-persist' },
      { ...identity, innerImageDigest: 'image:latest' }, { ...identity, attemptId: '../escape' },
      { ...identity, payloadDigest: '' }, { ...identity, bootId: 'x'.repeat(129) }
    ]) await expect(controller.execute(untrusted)).rejects.toThrow()
    expect(adapter.authorize).not.toHaveBeenCalled()
    expect(adapter.forward).not.toHaveBeenCalled()
  })

  it('a lost settlement acknowledgement replays durable evidence without new execution', async () => {
    const { controller, adapter, storage } = await fixture()
    await controller.execute(identity)
    storage.failSync = true
    await expect(controller.recordEvidence(evidence())).rejects.toThrow('crash after commit')
    const reopened = new DiskStorage(storage.path)
    databases.push(reopened)
    const restarted = new CloudExecutionController(reopened, adapter, true)
    expect((await restarted.execute(identity)).evidence).toEqual(evidence())
    expect((await restarted.readSlot()).attempt).toBeNull()
    expect(adapter.forward).toHaveBeenCalledTimes(1)
  })

  it('crash after forwarding but before acknowledgement persistence still consumes permanently', async () => {
    const { controller, adapter, storage } = await fixture()
    vi.mocked(adapter.forward).mockImplementation(async () => {
      storage.failCommit = true
    })
    await expect(controller.execute(identity)).rejects.toThrow('commit failed')
    const reopened = new DiskStorage(storage.path)
    databases.push(reopened)
    const restarted = new CloudExecutionController(reopened, adapter, true)
    expect((await restarted.execute(identity)).state).toBe('consumed')
    expect((await restarted.readSlot()).attempt).toEqual(identity)
    expect(adapter.forward).toHaveBeenCalledTimes(1)
  })
})
