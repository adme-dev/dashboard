import { createHash } from 'node:crypto'
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  rename,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  parseEvaluateArgs,
  publishEvaluationReports,
  runLakebaseEvaluation,
  type EvaluationPublisherFileSystem,
  type EvaluationSearch,
  type LakebaseEvaluationDependencies
} from '../../scripts/lakebase-pilot/evaluate'
import type { LakebasePilotFixture } from '../../scripts/lakebase-pilot/setup'
import type { PilotDatabase, PilotDatabaseQuery } from '../../scripts/lakebase-pilot/database'
import type { PilotSearchHit } from '../../scripts/lakebase-pilot/search'

const fixturePath = new URL('../fixtures/lakebase-crm-search.json', import.meta.url)
const temporaryDirectories: string[] = []
const SENSITIVE_TITLE = 'sensitive-title-must-not-leak'
const HTTP_URL = 'https://private-hostname.invalid/sensitive-path'
const HIT_EMAIL = 'hit-email@private.invalid'
const API_KEY = 'neon-api-key-must-not-leak'
const OPERATOR_EMAIL = 'owner@production.invalid'
const PROJECT_ID = 'pilot-project-must-not-leak'
const ENDPOINT_ID = 'pilot-endpoint-must-not-leak'
const DATABASE_HOST = 'pilot-hostname-must-not-leak.invalid'
const DATABASE_URL = `postgresql://pilot:database-password@${DATABASE_HOST}/app`
const PRODUCTION_PROJECT_ID = 'production-project-must-not-leak'
const EXCEPTION_TEXT = 'exception-text-must-not-leak'
const LOCK_OWNER_TOKEN = 'lock-owner-token-must-not-leak'
const LOCK_DIRECTORY = '.evaluation.lock'
const LEASE_FILE = 'lease.json'
const HEARTBEAT_FILE = 'heartbeat.json'
const LOCK_OWNER_PREFIX = '.evaluation.lock.owner.'
const LOCK_RECOVERY_SENTINEL = '.evaluation.lock.recovery'
const LOCK_RECOVERY_OWNER_PREFIX = '.evaluation.lock.recovery-owner.'
const LOCK_RELEASE_PREFIX = '.evaluation.lock.release.'
const LOCK_STALE_PREFIX = '.evaluation.lock.stale.'
const RECOVERY_MARKER = '.evaluation.recovery.json'
const PUBLICATION_RECOVERY_PREFIX = '.evaluation.publish-recovery.'

async function temporaryOutputDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'lakebase-pilot-evaluate-'))
  temporaryDirectories.push(directory)
  return directory
}

async function loadFixture(): Promise<LakebasePilotFixture> {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as LakebasePilotFixture
}

function hit(id: string): PilotSearchHit {
  return {
    type: 'person',
    id,
    title: `${SENSITIVE_TITLE} ${HTTP_URL}`,
    subtitle: HIT_EMAIL,
    rank: 1
  }
}

function relevantHits(fixture: LakebasePilotFixture, term: string): PilotSearchHit[] {
  return (fixture.queries.find(query => query.query === term)?.relevantIds || []).map(hit)
}

function fakeDatabase(): PilotDatabase {
  const query: PilotDatabaseQuery = async () => []
  return {
    query,
    transaction: async <T>(callback: (query: PilotDatabaseQuery) => Promise<T>) => callback(query),
    close: async () => {}
  }
}

function injectedDependencies(
  fixture: LakebasePilotFixture,
  overrides: Partial<LakebaseEvaluationDependencies> = {}
): LakebaseEvaluationDependencies {
  return {
    env: {
      NEON_API_KEY: API_KEY,
      OPERATOR_EMAIL
    },
    resolveTarget: () => ({
      projectId: PROJECT_ID,
      endpointId: ENDPOINT_ID,
      databaseUrl: DATABASE_URL,
      databaseHost: DATABASE_HOST,
      productionProjectId: PRODUCTION_PROJECT_ID
    }),
    createDatabase: async () => fakeDatabase(),
    fixture,
    now: () => new Date('2026-08-08T01:02:03.000Z'),
    ...overrides
  }
}

function realPublisherFileSystem(): EvaluationPublisherFileSystem {
  return {
    async makeDirectory(path, recursive) {
      await mkdir(path, { recursive })
    },
    async writeExclusive(path, content) {
      await writeFile(path, content, { flag: 'wx' })
    },
    async createSymlink(target, path) {
      await symlink(target, path, 'dir')
    },
    readLink: readlink,
    readText: (path: string) => readFile(path, 'utf8'),
    async readMetadata(path) {
      const metadata = await lstat(path)
      return { modifiedAtEpochMs: metadata.mtimeMs }
    },
    listDirectory: readdir,
    rename,
    async remove(path) {
      await rm(path, { recursive: true, force: true })
    }
  }
}

function nestedRecoveryCompatibleFileSystem(
  outputDir: string
): EvaluationPublisherFileSystem {
  const fileSystem = realPublisherFileSystem()
  const originalModifiedAt = new Map<string, number>()
  return {
    ...fileSystem,
    async readMetadata(path) {
      const modifiedAtEpochMs = originalModifiedAt.get(path)
      return modifiedAtEpochMs === undefined
        ? fileSystem.readMetadata(path)
        : { modifiedAtEpochMs }
    },
    async rename(from, to) {
      if (basename(from) === LOCK_DIRECTORY && basename(to) === 'stale-lock') {
        const target = await readlink(from)
        const metadata = await fileSystem.readMetadata(from)
        await fileSystem.rename(from, to)
        await fileSystem.remove(to)
        await symlink(join(outputDir, target), to, 'dir')
        originalModifiedAt.set(to, metadata.modifiedAtEpochMs)
        return
      }
      await fileSystem.rename(from, to)
    }
  }
}

function fingerprint(ownerToken: string): string {
  return createHash('sha256').update(ownerToken).digest('hex').slice(0, 24)
}

async function seedModernLock(
  outputDir: string,
  lease: {
    ownerToken: string
    acquiredAtEpochMs: number
    renewedAtEpochMs?: number
    processId?: number
    hostname?: string
    ownerDirectoryName?: string
    canonicalTarget?: string
  }
): Promise<{ lockPath: string, ownerDirectoryPath: string, ownerDirectoryName: string }> {
  const derivedOwnerDirectoryName = `${LOCK_OWNER_PREFIX}${fingerprint(lease.ownerToken)}`
  const ownerDirectoryName = lease.canonicalTarget ?? derivedOwnerDirectoryName
  const ownerDirectoryPath = join(outputDir, ownerDirectoryName)
  await mkdir(ownerDirectoryPath)
  await writeFile(join(ownerDirectoryPath, LEASE_FILE), `${JSON.stringify({
    schemaVersion: 1,
    ownerToken: lease.ownerToken,
    acquiredAtEpochMs: lease.acquiredAtEpochMs,
    processId: lease.processId ?? 999_999,
    hostname: lease.hostname ?? hostname(),
    ownerDirectoryName: lease.ownerDirectoryName ?? ownerDirectoryName
  })}\n`)
  await writeFile(join(ownerDirectoryPath, HEARTBEAT_FILE), `${JSON.stringify({
    schemaVersion: 1,
    ownerToken: lease.ownerToken,
    renewedAtEpochMs: lease.renewedAtEpochMs ?? lease.acquiredAtEpochMs
  })}\n`)
  const lockPath = join(outputDir, LOCK_DIRECTORY)
  await symlink(ownerDirectoryName, lockPath, 'dir')
  return { lockPath, ownerDirectoryPath, ownerDirectoryName }
}

async function seedRecoverySentinel(
  outputDir: string,
  lease: {
    ownerToken: string
    acquiredAtEpochMs: number
    processId?: number
    hostname?: string
  }
): Promise<{ sentinelPath: string, ownerDirectoryPath: string }> {
  const ownerDirectoryName = `${LOCK_RECOVERY_OWNER_PREFIX}${fingerprint(lease.ownerToken)}`
  const ownerDirectoryPath = join(outputDir, ownerDirectoryName)
  await mkdir(ownerDirectoryPath)
  await writeFile(join(ownerDirectoryPath, LEASE_FILE), `${JSON.stringify({
    schemaVersion: 1,
    ownerToken: lease.ownerToken,
    acquiredAtEpochMs: lease.acquiredAtEpochMs,
    processId: lease.processId ?? 999_999,
    hostname: lease.hostname ?? hostname(),
    ownerDirectoryName
  })}\n`)
  await writeFile(join(ownerDirectoryPath, HEARTBEAT_FILE), `${JSON.stringify({
    schemaVersion: 1,
    ownerToken: lease.ownerToken,
    renewedAtEpochMs: lease.acquiredAtEpochMs
  })}\n`)
  const sentinelPath = join(outputDir, LOCK_RECOVERY_SENTINEL)
  await symlink(ownerDirectoryName, sentinelPath, 'dir')
  return { sentinelPath, ownerDirectoryPath }
}

async function seedLease(
  outputDir: string,
  lease: {
    ownerToken: string
    acquiredAtEpochMs: number
    processId?: number
    hostname?: string
  }
): Promise<string> {
  const lockPath = join(outputDir, LOCK_DIRECTORY)
  await mkdir(lockPath)
  await writeFile(join(lockPath, LEASE_FILE), `${JSON.stringify({
    schemaVersion: 1,
    ownerToken: lease.ownerToken,
    acquiredAtEpochMs: lease.acquiredAtEpochMs,
    processId: lease.processId ?? 999_999,
    hostname: lease.hostname ?? 'inactive-test-host'
  })}\n`)
  return lockPath
}

async function publicationRecoveryEvidence(outputDir: string): Promise<{
  directoryPath: string
  files: string[]
}> {
  const directoryName = (await readdir(outputDir)).find(name => (
    name.startsWith(PUBLICATION_RECOVERY_PREFIX)
  ))
  expect(directoryName).toBeDefined()
  const directoryPath = join(outputDir, directoryName!)
  return { directoryPath, files: await readdir(directoryPath) }
}

function deferred(): { promise: Promise<void>, resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function timedRelevantSearch(
  fixture: LakebasePilotFixture,
  clock: { value: number },
  latency: number,
  alter?: (input: {
    term: string
    call: number
    baseline: PilotSearchHit[]
  }) => Awaited<ReturnType<EvaluationSearch>> | undefined
): EvaluationSearch {
  const callsByTerm = new Map<string, number>()
  return async (_database, _clientId, term) => {
    clock.value += latency
    const call = (callsByTerm.get(term) || 0) + 1
    callsByTerm.set(term, call)
    const baseline = relevantHits(fixture, term)
    return alter?.({ term, call, baseline }) ?? baseline
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {
    recursive: true,
    force: true
  })))
})

describe('Lakebase evaluation CLI arguments', () => {
  it('defaults to twenty bounded runs and the private evidence directory', () => {
    expect(parseEvaluateArgs([])).toEqual({
      runs: 20,
      coldStart: false,
      outputDir: '.data/lakebase-pilot'
    })
    expect(parseEvaluateArgs(['--runs', '20', '--cold-start'])).toEqual({
      runs: 20,
      coldStart: true,
      outputDir: '.data/lakebase-pilot'
    })
    expect(parseEvaluateArgs(['--output', '/tmp/evidence', '--runs', '1'])).toEqual({
      runs: 1,
      coldStart: false,
      outputDir: '/tmp/evidence'
    })
  })

  it.each([
    ['--runs', '0'],
    ['--runs', '501'],
    ['--runs', '1.5'],
    ['--runs'],
    ['--output', ''],
    ['--output', '--cold-start'],
    ['--unknown']
  ])('rejects malformed or unbounded arguments: %s %s', (...args) => {
    expect(() => parseEvaluateArgs(args.filter((arg): arg is string => arg !== undefined)))
      .toThrow('Usage:')
  })
})

describe('Lakebase evaluation report publication', () => {
  it('makes the canonical lock visible only after its complete lease is prepared', async () => {
    const outputDir = await temporaryOutputDirectory()
    const fileSystem = realPublisherFileSystem()
    let canonicalInstalledWithCompleteLease = false

    await publishEvaluationReports(
      outputDir,
      { json: '{"writer":"atomic"}\n', markdown: 'writer:atomic\n' },
      {
        fileSystem: {
          ...fileSystem,
          async createSymlink(target, path) {
            const lease = JSON.parse(await readFile(join(outputDir, target, LEASE_FILE), 'utf8'))
            const heartbeat = JSON.parse(
              await readFile(join(outputDir, target, HEARTBEAT_FILE), 'utf8')
            )
            expect(lease).toMatchObject({ schemaVersion: 1, ownerToken: expect.any(String) })
            expect(heartbeat).toMatchObject({
              schemaVersion: 1,
              ownerToken: lease.ownerToken,
              renewedAtEpochMs: expect.any(Number)
            })
            canonicalInstalledWithCompleteLease = true
            await symlink(target, path, 'dir')
          }
        }
      }
    )

    expect(canonicalInstalledWithCompleteLease).toBe(true)
  })

  it('leaves an uninstalled prepared lease isolated when canonical publication crashes', async () => {
    const outputDir = await temporaryOutputDirectory()
    const fileSystem = realPublisherFileSystem()
    let simulatedCrash = false

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"crashed"}\n', markdown: 'writer:crashed\n' },
      {
        ownerToken: () => 'crashed-before-canonical-owner',
        fileSystem: {
          ...fileSystem,
          async createSymlink(target, path) {
            if (!simulatedCrash && basename(path) === LOCK_DIRECTORY) {
              simulatedCrash = true
              throw new Error(EXCEPTION_TEXT)
            }
            await fileSystem.createSymlink(target, path)
          },
          async remove(path) {
            if (basename(path).startsWith('.evaluation.lock.owner.')) {
              throw new Error(EXCEPTION_TEXT)
            }
            await fileSystem.remove(path)
          }
        }
      }
    )).rejects.toMatchObject({ code: 'lakebase_evaluation_publish_failed' })

    const crashedOwnerArtifact = (await readdir(outputDir)).find(name => (
      name.startsWith('.evaluation.lock.owner.')
    ))
    expect(crashedOwnerArtifact).toBeDefined()
    expect(await readdir(outputDir)).not.toContain(LOCK_DIRECTORY)

    await publishEvaluationReports(
      outputDir,
      { json: '{"writer":"next"}\n', markdown: 'writer:next\n' }
    )
    expect(await readdir(outputDir)).toContain(crashedOwnerArtifact)
    expect(await readFile(join(outputDir, 'evaluation.json'), 'utf8'))
      .toBe('{"writer":"next"}\n')
  })

  it('does not remove an existing owner artifact when candidate preparation collides', async () => {
    const outputDir = await temporaryOutputDirectory()
    const ownerToken = 'colliding-owner-token'
    const ownerDirectoryName = `.evaluation.lock.owner.${createHash('sha256')
      .update(ownerToken)
      .digest('hex')
      .slice(0, 24)}`
    const ownerDirectoryPath = join(outputDir, ownerDirectoryName)
    await mkdir(ownerDirectoryPath)
    await writeFile(join(ownerDirectoryPath, 'other-owner-artifact'), 'preserve-me\n')

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{}\n', markdown: 'safe\n' },
      { ownerToken: () => ownerToken }
    )).rejects.toMatchObject({ code: 'lakebase_evaluation_publish_failed' })

    expect(await readFile(join(ownerDirectoryPath, 'other-owner-artifact'), 'utf8'))
      .toBe('preserve-me\n')
  })

  it.each([
    ['missing', undefined],
    ['malformed', '{not-json}\n']
  ])('fails closed on an expired legacy canonical lock with a %s lease', async (_case, lease) => {
    const outputDir = await temporaryOutputDirectory()
    const lockPath = join(outputDir, LOCK_DIRECTORY)
    await mkdir(lockPath)
    if (lease) await writeFile(join(lockPath, LEASE_FILE), lease)

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"recovered"}\n', markdown: 'writer:recovered\n' },
      {
        now: () => Date.now() + 10_000,
        leaseDurationMs: 100,
        sleep: async () => {}
      }
    )).rejects.toMatchObject({ code: 'lakebase_evaluation_publish_lock_unavailable' })

    expect((await readdir(outputDir)).sort()).toEqual([LOCK_DIRECTORY])
  })

  it('recovers an expired modern relative-symlink lock without rebasing its target', async () => {
    const outputDir = await temporaryOutputDirectory()
    const stale = await seedModernLock(outputDir, {
      ownerToken: 'expired-modern-owner',
      acquiredAtEpochMs: 1_000
    })

    await publishEvaluationReports(
      outputDir,
      { json: '{"writer":"modern-recovery"}\n', markdown: 'writer:modern-recovery\n' },
      {
        now: () => 10_000,
        leaseDurationMs: 100,
        sleep: async () => {}
      }
    )

    expect(await readFile(join(outputDir, 'evaluation.json'), 'utf8'))
      .toBe('{"writer":"modern-recovery"}\n')
    await expect(lstat(stale.ownerDirectoryPath)).rejects.toThrow()
    expect((await readdir(outputDir)).sort()).toEqual(['evaluation.json', 'evaluation.md'])
  })

  it('takes over an expired recovery sentinel left by a crashed local recoverer', async () => {
    const outputDir = await temporaryOutputDirectory()
    const crashed = await seedRecoverySentinel(outputDir, {
      ownerToken: 'crashed-recovery-owner',
      acquiredAtEpochMs: 1_000
    })

    await publishEvaluationReports(
      outputDir,
      { json: '{"writer":"after-recovery-crash"}\n', markdown: 'writer:after-recovery-crash\n' },
      {
        now: () => 10_000,
        leaseDurationMs: 100,
        sleep: async () => {}
      }
    )

    expect(await readFile(join(outputDir, 'evaluation.json'), 'utf8'))
      .toBe('{"writer":"after-recovery-crash"}\n')
    await expect(lstat(crashed.sentinelPath)).rejects.toThrow()
    await expect(lstat(crashed.ownerDirectoryPath)).rejects.toThrow()
  })

  it('clears its live recovery sentinel when stale quarantine fails', async () => {
    const outputDir = await temporaryOutputDirectory()
    await seedModernLock(outputDir, {
      ownerToken: 'stale-owner-before-quarantine-failure',
      acquiredAtEpochMs: 1_000
    })
    const fileSystem = realPublisherFileSystem()
    let quarantineFailed = false

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"failed-recoverer"}\n', markdown: 'failed-recoverer\n' },
      {
        now: () => 10_000,
        leaseDurationMs: 100,
        sleep: async () => {},
        fileSystem: {
          ...fileSystem,
          async rename(from, to) {
            if (!quarantineFailed
              && basename(from) === LOCK_DIRECTORY
              && basename(to).startsWith(LOCK_STALE_PREFIX)) {
              quarantineFailed = true
              await fileSystem.rename(from, to)
              throw new Error(EXCEPTION_TEXT)
            }
            await fileSystem.rename(from, to)
          }
        }
      }
    )).rejects.toMatchObject({ code: 'lakebase_evaluation_publish_failed' })

    expect(await readdir(outputDir)).not.toContain(LOCK_RECOVERY_SENTINEL)

    await publishEvaluationReports(
      outputDir,
      { json: '{"writer":"next-recoverer"}\n', markdown: 'next-recoverer\n' },
      {
        now: () => 10_000,
        leaseDurationMs: 100,
        sleep: async () => {}
      }
    )

    expect(await readFile(join(outputDir, 'evaluation.json'), 'utf8'))
      .toBe('{"writer":"next-recoverer"}\n')
    expect((await readdir(outputDir)).sort()).toEqual(['evaluation.json', 'evaluation.md'])
  })

  it('clears its live recovery sentinel when a contender occupies the quarantine vacancy', async () => {
    const outputDir = await temporaryOutputDirectory()
    await seedModernLock(outputDir, {
      ownerToken: 'stale-owner-before-vacancy-contender',
      acquiredAtEpochMs: 1_000
    })
    const fileSystem = realPublisherFileSystem()
    const contenderToken = 'quarantine-vacancy-contender'
    const contenderDirectoryName = `${LOCK_OWNER_PREFIX}${fingerprint(contenderToken)}`
    const contenderDirectoryPath = join(outputDir, contenderDirectoryName)
    let contenderInstalled = false

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"recoverer"}\n', markdown: 'recoverer\n' },
      {
        now: () => 10_000,
        leaseDurationMs: 100,
        sleep: async () => {},
        fileSystem: {
          ...fileSystem,
          async rename(from, to) {
            await fileSystem.rename(from, to)
            if (!contenderInstalled
              && basename(from) === LOCK_DIRECTORY
              && basename(to).startsWith(LOCK_STALE_PREFIX)) {
              contenderInstalled = true
              await mkdir(contenderDirectoryPath)
              await writeFile(join(contenderDirectoryPath, LEASE_FILE), `${JSON.stringify({
                schemaVersion: 1,
                ownerToken: contenderToken,
                acquiredAtEpochMs: 10_000,
                processId: process.pid,
                hostname: hostname(),
                ownerDirectoryName: contenderDirectoryName
              })}\n`)
              await writeFile(join(contenderDirectoryPath, HEARTBEAT_FILE), `${JSON.stringify({
                schemaVersion: 1,
                ownerToken: contenderToken,
                renewedAtEpochMs: 10_000
              })}\n`)
              await symlink(contenderDirectoryName, from, 'dir')
            }
          }
        }
      }
    )).rejects.toMatchObject({ code: 'lakebase_evaluation_publish_lock_unavailable' })

    expect(await readdir(outputDir)).not.toContain(LOCK_RECOVERY_SENTINEL)
    expect(await readlink(join(outputDir, LOCK_DIRECTORY))).toBe(contenderDirectoryName)
    expect((await readdir(outputDir)).filter(name => name.startsWith(LOCK_STALE_PREFIX)))
      .toEqual([])
    expect(await readFile(join(contenderDirectoryPath, LEASE_FILE), 'utf8'))
      .toContain(contenderToken)
  })

  it('never deletes an owner artifact named only by a tampered stale lease', async () => {
    const outputDir = await temporaryOutputDirectory()
    const victimToken = 'unrelated-owner-token'
    const victimDirectoryName = `${LOCK_OWNER_PREFIX}${fingerprint(victimToken)}`
    const victimDirectoryPath = join(outputDir, victimDirectoryName)
    await mkdir(victimDirectoryPath)
    await writeFile(join(victimDirectoryPath, 'preserve-me'), 'unrelated-owner-artifact\n')
    const stale = await seedModernLock(outputDir, {
      ownerToken: 'tampered-stale-owner',
      acquiredAtEpochMs: 1_000,
      ownerDirectoryName: victimDirectoryName
    })

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"safe-recovery"}\n', markdown: 'writer:safe-recovery\n' },
      {
        now: () => 10_000,
        leaseDurationMs: 100,
        sleep: async () => {},
        fileSystem: nestedRecoveryCompatibleFileSystem(outputDir)
      }
    )).rejects.toMatchObject({ code: 'lakebase_evaluation_publish_lock_unavailable' })

    expect(await readFile(join(victimDirectoryPath, 'preserve-me'), 'utf8'))
      .toBe('unrelated-owner-artifact\n')
    expect(await readFile(join(stale.ownerDirectoryPath, LEASE_FILE), 'utf8'))
      .toContain('tampered-stale-owner')
    expect(stale.ownerDirectoryName).not.toBe(victimDirectoryName)
  })

  it('fails closed on a foreign-host lease after its heartbeat expires', async () => {
    const outputDir = await temporaryOutputDirectory()
    const lockPath = await seedLease(outputDir, {
      ownerToken: 'foreign-owner-token',
      acquiredAtEpochMs: 1_000,
      hostname: 'foreign-host'
    })
    await writeFile(join(lockPath, HEARTBEAT_FILE), `${JSON.stringify({
      schemaVersion: 1,
      ownerToken: 'foreign-owner-token',
      renewedAtEpochMs: 9_000
    })}\n`)

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"after-expiry"}\n', markdown: 'writer:after-expiry\n' },
      {
        now: () => 10_000,
        leaseDurationMs: 100,
        sleep: async () => {}
      }
    )).rejects.toMatchObject({ code: 'lakebase_evaluation_publish_lock_unavailable' })

    expect(await readFile(join(lockPath, LEASE_FILE), 'utf8')).toContain('foreign-owner-token')
  })

  it('renews an active lease so a contender waits beyond the original expiry', async () => {
    const outputDir = await temporaryOutputDirectory()
    const fileSystem = realPublisherFileSystem()
    const firstStageStarted = deferred()
    const releaseFirstStage = deferred()
    let delayed = false
    let secondSettled = false
    const controlledFileSystem: EvaluationPublisherFileSystem = {
      ...fileSystem,
      async writeExclusive(path, content) {
        if (!delayed
          && basename(path).startsWith('.evaluation.json.')
          && basename(path).endsWith('.tmp')) {
          delayed = true
          firstStageStarted.resolve()
          await releaseFirstStage.promise
        }
        await fileSystem.writeExclusive(path, content)
      }
    }

    const first = publishEvaluationReports(
      outputDir,
      { json: '{"writer":"first"}\n', markdown: 'writer:first\n' },
      {
        fileSystem: controlledFileSystem,
        leaseDurationMs: 40,
        heartbeatIntervalMs: 5
      }
    )
    await firstStageStarted.promise
    await new Promise<void>(resolve => setTimeout(resolve, 70))

    const second = publishEvaluationReports(
      outputDir,
      { json: '{"writer":"second"}\n', markdown: 'writer:second\n' },
      {
        fileSystem: controlledFileSystem,
        leaseDurationMs: 40,
        heartbeatIntervalMs: 5
      }
    ).finally(() => {
      secondSettled = true
    })
    await new Promise<void>(resolve => setTimeout(resolve, 20))
    expect(secondSettled).toBe(false)

    releaseFirstStage.resolve()
    await Promise.all([first, second])
    expect(await readFile(join(outputDir, 'evaluation.json'), 'utf8'))
      .toBe('{"writer":"second"}\n')
  })

  it('fails closed when lease ownership is lost before the first backup mutation', async () => {
    const outputDir = await temporaryOutputDirectory()
    const fileSystem = realPublisherFileSystem()
    const replacementLease = `${JSON.stringify({
      schemaVersion: 1,
      ownerToken: 'replacement-owner-token',
      acquiredAtEpochMs: Date.now(),
      processId: process.pid,
      hostname: 'replacement-host'
    })}\n`
    let ownershipReplaced = false

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"must-not-publish"}\n', markdown: 'writer:must-not-publish\n' },
      {
        fileSystem: {
          ...fileSystem,
          async writeExclusive(path, content) {
            await fileSystem.writeExclusive(path, content)
            if (!ownershipReplaced
              && basename(path).startsWith('.evaluation.md.')
              && basename(path).endsWith('.tmp')) {
              ownershipReplaced = true
              await writeFile(join(outputDir, LOCK_DIRECTORY, LEASE_FILE), replacementLease)
            }
          }
        }
      }
    )).rejects.toMatchObject({ code: 'lakebase_evaluation_publish_lock_lost' })

    await expect(readFile(join(outputDir, 'evaluation.json'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(outputDir, 'evaluation.md'), 'utf8')).rejects.toThrow()
    expect(await readFile(join(outputDir, LOCK_DIRECTORY, LEASE_FILE), 'utf8'))
      .toBe(replacementLease)
  })

  it('does not let a contender take over inside an owned final mutation window', async () => {
    const outputDir = await temporaryOutputDirectory()
    const fileSystem = nestedRecoveryCompatibleFileSystem(outputDir)
    let publicationStateWritten = false
    let ownershipChecksAfterState = 0
    let takeoverInjected = false
    let contenderFailure: unknown
    let formerOwnerMutatedFinal = false
    const controlledFileSystem: EvaluationPublisherFileSystem = {
      ...fileSystem,
      async writeExclusive(path, content) {
        await fileSystem.writeExclusive(path, content)
        if (basename(path) === 'state.json') publicationStateWritten = true
      },
      async readText(path) {
        const content = await fileSystem.readText(path)
        if (publicationStateWritten
          && basename(path) === HEARTBEAT_FILE
          && !takeoverInjected) {
          ownershipChecksAfterState += 1
          if (ownershipChecksAfterState === 3) {
            takeoverInjected = true
            try {
              await publishEvaluationReports(
                outputDir,
                { json: '{"writer":"contender"}\n', markdown: 'writer:contender\n' },
                {
                  fileSystem: controlledFileSystem,
                  now: () => 20_000,
                  leaseDurationMs: 100,
                  ownerToken: () => 'mutation-window-contender',
                  sleep: async () => {}
                }
              )
            } catch (error) {
              contenderFailure = error
            }
          }
        }
        return content
      },
      async rename(from, to) {
        if (basename(from).startsWith('.evaluation.json.')
          && basename(from).endsWith('.tmp')
          && basename(to) === 'evaluation.json'
          && contenderFailure instanceof Error
          && 'code' in contenderFailure
          && contenderFailure.code !== 'lakebase_evaluation_publish_lock_unavailable') {
          formerOwnerMutatedFinal = true
        }
        await fileSystem.rename(from, to)
      }
    }

    await publishEvaluationReports(
      outputDir,
      { json: '{"writer":"original"}\n', markdown: 'writer:original\n' },
      {
        fileSystem: controlledFileSystem,
        now: () => 10_000,
        leaseDurationMs: 3_000,
        ownerToken: () => 'mutation-window-original',
        sleep: async () => {}
      }
    )

    expect(contenderFailure).toMatchObject({
      code: 'lakebase_evaluation_publish_lock_unavailable'
    })
    expect(formerOwnerMutatedFinal).toBe(false)
    expect(await readFile(join(outputDir, 'evaluation.json'), 'utf8'))
      .toBe('{"writer":"original"}\n')
    expect(await readFile(join(outputDir, 'evaluation.md'), 'utf8'))
      .toBe('writer:original\n')
  })

  it('does not let a contender replace the canonical lock inside the release window', async () => {
    const outputDir = await temporaryOutputDirectory()
    const fileSystem = nestedRecoveryCompatibleFileSystem(outputDir)
    let takeoverInjected = false
    let contenderFailure: unknown
    const originalTarget = `${LOCK_OWNER_PREFIX}${fingerprint('release-window-original')}`
    const controlledFileSystem: EvaluationPublisherFileSystem = {
      ...fileSystem,
      async rename(from, to) {
        if (basename(from) === LOCK_DIRECTORY
          && basename(to).startsWith(LOCK_RELEASE_PREFIX)
          && !takeoverInjected) {
          takeoverInjected = true
          try {
            await publishEvaluationReports(
              outputDir,
              { json: '{"writer":"release-contender"}\n', markdown: 'release-contender\n' },
              {
                fileSystem: controlledFileSystem,
                now: () => 20_000,
                leaseDurationMs: 100,
                ownerToken: () => 'release-window-contender',
                sleep: async () => {}
              }
            )
          } catch (error) {
            contenderFailure = error
          }
          expect(await readlink(from)).toBe(originalTarget)
        }
        await fileSystem.rename(from, to)
      }
    }

    await publishEvaluationReports(
      outputDir,
      { json: '{"writer":"original"}\n', markdown: 'writer:original\n' },
      {
        fileSystem: controlledFileSystem,
        now: () => 10_000,
        leaseDurationMs: 3_000,
        ownerToken: () => 'release-window-original',
        sleep: async () => {}
      }
    )

    expect(contenderFailure).toMatchObject({
      code: 'lakebase_evaluation_publish_lock_unavailable'
    })
    expect(await readFile(join(outputDir, 'evaluation.json'), 'utf8'))
      .toBe('{"writer":"original"}\n')
    expect(await readFile(join(outputDir, 'evaluation.md'), 'utf8'))
      .toBe('writer:original\n')
  })

  it('re-verifies ownership between cleanup mutations', async () => {
    const outputDir = await temporaryOutputDirectory()
    const fileSystem = realPublisherFileSystem()
    let ownershipReplaced = false
    let markdownCleanupAttempted = false

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"published"}\n', markdown: 'writer:published\n' },
      {
        fileSystem: {
          ...fileSystem,
          async remove(path) {
            if (basename(path).startsWith('.evaluation.md.')
              && basename(path).endsWith('.tmp')) {
              markdownCleanupAttempted = true
            }
            await fileSystem.remove(path)
            if (!ownershipReplaced
              && basename(path).startsWith('.evaluation.json.')
              && basename(path).endsWith('.tmp')) {
              ownershipReplaced = true
              await writeFile(join(outputDir, LOCK_DIRECTORY, LEASE_FILE), `${JSON.stringify({
                schemaVersion: 1,
                ownerToken: 'cleanup-replacement-owner',
                acquiredAtEpochMs: Date.now(),
                processId: process.pid,
                hostname: 'replacement-host'
              })}\n`)
            }
          }
        }
      }
    )).rejects.toMatchObject({ code: 'lakebase_evaluation_publish_lock_lost' })

    expect(markdownCleanupAttempted).toBe(false)
    expect(await readFile(join(outputDir, LOCK_DIRECTORY, LEASE_FILE), 'utf8'))
      .toContain('cleanup-replacement-owner')
  })

  it('returns a stable coded failure when the output directory cannot be prepared', async () => {
    const outputDir = join(await temporaryOutputDirectory(), 'secret-output-path')
    const fileSystem = realPublisherFileSystem()

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{}\n', markdown: 'safe\n' },
      {
        fileSystem: {
          ...fileSystem,
          async makeDirectory() {
            throw new Error(`${EXCEPTION_TEXT}:${outputDir}`)
          }
        }
      }
    )).rejects.toMatchObject({
      code: 'lakebase_evaluation_publish_failed',
      message: 'lakebase_evaluation_publish_failed'
    })
  })

  it('does not steal a stale-looking lease while its owner is active', async () => {
    const outputDir = await temporaryOutputDirectory()
    const lockPath = await seedLease(outputDir, {
      ownerToken: LOCK_OWNER_TOKEN,
      acquiredAtEpochMs: 1_000
    })
    const originalLease = await readFile(join(lockPath, LEASE_FILE), 'utf8')
    await writeFile(join(lockPath, HEARTBEAT_FILE), `${JSON.stringify({
      schemaVersion: 1,
      ownerToken: LOCK_OWNER_TOKEN,
      renewedAtEpochMs: 9_990
    })}\n`)

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{}\n', markdown: 'safe\n' },
      {
        now: () => 10_000,
        leaseDurationMs: 100,
        ownerToken: () => 'contender-owner-token',
        sleep: async () => {}
      }
    )).rejects.toMatchObject({
      code: 'lakebase_evaluation_publish_lock_unavailable',
      message: 'lakebase_evaluation_publish_lock_unavailable'
    })

    expect(await readFile(join(lockPath, LEASE_FILE), 'utf8')).toBe(originalLease)
    expect((await readdir(outputDir)).sort()).toEqual([LOCK_DIRECTORY])
  })

  it('atomically recovers a stale lease whose owner is inactive', async () => {
    const outputDir = await temporaryOutputDirectory()
    await seedModernLock(outputDir, {
      ownerToken: LOCK_OWNER_TOKEN,
      acquiredAtEpochMs: 1_000
    })

    await publishEvaluationReports(
      outputDir,
      { json: '{"writer":"recovered"}\n', markdown: 'writer:recovered\n' },
      {
        now: () => 10_000,
        leaseDurationMs: 100,
        ownerToken: () => 'recovery-owner-token',
        sleep: async () => {}
      }
    )

    expect(await readFile(join(outputDir, 'evaluation.json'), 'utf8'))
      .toBe('{"writer":"recovered"}\n')
    expect(await readFile(join(outputDir, 'evaluation.md'), 'utf8'))
      .toBe('writer:recovered\n')
    expect((await readdir(outputDir)).sort()).toEqual(['evaluation.json', 'evaluation.md'])
  })

  it('allows only one contender to own an atomically recovered stale lease', async () => {
    const outputDir = await temporaryOutputDirectory()
    await seedModernLock(outputDir, {
      ownerToken: LOCK_OWNER_TOKEN,
      acquiredAtEpochMs: 1_000
    })
    const retryYield = async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    }

    await Promise.all([
      publishEvaluationReports(
        outputDir,
        { json: '{"writer":"first"}\n', markdown: 'writer:first\n' },
        {
          now: () => 10_000,
          leaseDurationMs: 100,
          ownerToken: () => 'first-contender-token',
          sleep: retryYield
        }
      ),
      publishEvaluationReports(
        outputDir,
        { json: '{"writer":"second"}\n', markdown: 'writer:second\n' },
        {
          now: () => 10_000,
          leaseDurationMs: 100,
          ownerToken: () => 'second-contender-token',
          sleep: retryYield
        }
      )
    ])

    const json = JSON.parse(await readFile(join(outputDir, 'evaluation.json'), 'utf8')) as { writer: string }
    const markdown = await readFile(join(outputDir, 'evaluation.md'), 'utf8')
    expect(['first', 'second']).toContain(json.writer)
    expect(markdown).toBe(`writer:${json.writer}\n`)
    expect((await readdir(outputDir)).sort()).toEqual(['evaluation.json', 'evaluation.md'])
  })

  it('does not take over a replacement lease that changed after stale inspection', async () => {
    const outputDir = await temporaryOutputDirectory()
    const stale = await seedModernLock(outputDir, {
      ownerToken: LOCK_OWNER_TOKEN,
      acquiredAtEpochMs: 1_000
    })
    const { lockPath } = stale
    const fileSystem = realPublisherFileSystem()
    const replacementLease = `${JSON.stringify({
      schemaVersion: 1,
      ownerToken: 'replacement-owner-token',
      acquiredAtEpochMs: 10_000,
      processId: process.pid,
      hostname: 'replacement-host'
    })}\n`
    let replaced = false

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"contender"}\n', markdown: 'writer:contender\n' },
      {
        now: () => 10_000,
        leaseDurationMs: 100,
        sleep: async () => {},
        fileSystem: {
          ...fileSystem,
          async rename(from, to) {
            if (!replaced
              && basename(from) === LOCK_DIRECTORY
              && (basename(to).startsWith(`${LOCK_DIRECTORY}.stale.`)
                || basename(to) === 'stale-lock')) {
              replaced = true
              await writeFile(join(from, LEASE_FILE), replacementLease)
            }
            await fileSystem.rename(from, to)
          }
        }
      }
    )).rejects.toMatchObject({
      code: 'lakebase_evaluation_publish_lock_unavailable'
    })

    expect(await readFile(join(lockPath, LEASE_FILE), 'utf8')).toBe(replacementLease)
    expect((await readdir(outputDir)).sort()).toEqual([
      LOCK_DIRECTORY,
      stale.ownerDirectoryName
    ].sort())
  })

  it('keeps a recovery sentinel while restoring a replacement lease before contenders acquire', async () => {
    const outputDir = await temporaryOutputDirectory()
    await seedModernLock(outputDir, {
      ownerToken: LOCK_OWNER_TOKEN,
      acquiredAtEpochMs: 1_000
    })
    const fileSystem = realPublisherFileSystem()
    const quarantined = deferred()
    const continueRecovery = deferred()
    let replacementInstalled = false
    let contenderSettled = false
    let holdContender = true
    const replacementLease = `${JSON.stringify({
      schemaVersion: 1,
      ownerToken: 'live-replacement-owner',
      acquiredAtEpochMs: 10_000,
      processId: process.pid,
      hostname: 'replacement-host'
    })}\n`
    const replacementHeartbeat = `${JSON.stringify({
      schemaVersion: 1,
      ownerToken: 'live-replacement-owner',
      renewedAtEpochMs: 10_000
    })}\n`

    const recovering = publishEvaluationReports(
      outputDir,
      { json: '{"writer":"recovering"}\n', markdown: 'writer:recovering\n' },
      {
        now: () => 10_000,
        leaseDurationMs: 100,
        ownerToken: () => 'recovery-contender-owner',
        sleep: async () => {},
        fileSystem: {
          ...fileSystem,
          async rename(from, to) {
            if (!replacementInstalled && basename(from) === LOCK_DIRECTORY) {
              replacementInstalled = true
              await writeFile(join(from, LEASE_FILE), replacementLease)
              await writeFile(join(from, HEARTBEAT_FILE), replacementHeartbeat)
              await fileSystem.rename(from, to)
              quarantined.resolve()
              await continueRecovery.promise
              return
            }
            await fileSystem.rename(from, to)
          }
        }
      }
    )

    await quarantined.promise
    const contender = publishEvaluationReports(
      outputDir,
      { json: '{"writer":"contender"}\n', markdown: 'writer:contender\n' },
      {
        now: () => 10_000,
        leaseDurationMs: 100,
        sleep: async () => {
          if (holdContender) await new Promise<void>(resolve => setTimeout(resolve, 1))
        }
      }
    ).finally(() => {
      contenderSettled = true
    })

    await new Promise<void>(resolve => setTimeout(resolve, 20))
    expect(contenderSettled).toBe(false)
    holdContender = false
    continueRecovery.resolve()
    const outcomes = await Promise.allSettled([recovering, contender])

    expect(outcomes).toEqual([
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ code: 'lakebase_evaluation_publish_lock_unavailable' })
      }),
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ code: 'lakebase_evaluation_publish_lock_unavailable' })
      })
    ])
    expect(await readFile(join(outputDir, LOCK_DIRECTORY, LEASE_FILE), 'utf8'))
      .toBe(replacementLease)
    await expect(readFile(join(outputDir, 'evaluation.json'), 'utf8')).rejects.toThrow()
    expect((await readdir(outputDir)).filter(name => name.includes('.stale.'))).toEqual([])
  })

  it('surfaces owner-verified lock release failure after successful publication', async () => {
    const outputDir = await temporaryOutputDirectory()
    const fileSystem = realPublisherFileSystem()

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"new"}\n', markdown: 'writer:new\n' },
      {
        ownerToken: () => LOCK_OWNER_TOKEN,
        fileSystem: {
          ...fileSystem,
          async rename(from, to) {
            if (basename(from) === LOCK_DIRECTORY
              && basename(to).startsWith(LOCK_RELEASE_PREFIX)) {
              throw new Error(`${EXCEPTION_TEXT}:${from}`)
            }
            await fileSystem.rename(from, to)
          }
        }
      }
    )).rejects.toMatchObject({
      code: 'lakebase_evaluation_publish_lock_release_failed',
      message: 'lakebase_evaluation_publish_lock_release_failed'
    })

    expect(await readFile(join(outputDir, 'evaluation.json'), 'utf8')).toContain('"new"')
    expect(await readFile(join(outputDir, 'evaluation.md'), 'utf8')).toContain('new')
    expect(await readdir(outputDir)).toContain(LOCK_DIRECTORY)
  })

  it('refuses to release a lock whose lease owner changed', async () => {
    const outputDir = await temporaryOutputDirectory()
    const fileSystem = realPublisherFileSystem()
    let ownershipChanged = false

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"new"}\n', markdown: 'writer:new\n' },
      {
        ownerToken: () => LOCK_OWNER_TOKEN,
        fileSystem: {
          ...fileSystem,
          async rename(from, to) {
            await fileSystem.rename(from, to)
            if (!ownershipChanged
              && basename(from).startsWith('.evaluation.md.')
              && basename(from).endsWith('.tmp')
              && basename(to) === 'evaluation.md') {
              ownershipChanged = true
              await writeFile(join(outputDir, LOCK_DIRECTORY, LEASE_FILE), `${JSON.stringify({
                schemaVersion: 1,
                ownerToken: 'different-owner-token',
                acquiredAtEpochMs: Date.now(),
                processId: process.pid,
                hostname: 'changed-owner-host'
              })}\n`)
            }
          }
        }
      }
    )).rejects.toMatchObject({ code: 'lakebase_evaluation_publish_lock_lost' })

    expect(await readdir(outputDir)).toContain(LOCK_DIRECTORY)
    expect(await readFile(join(outputDir, LOCK_DIRECTORY, LEASE_FILE), 'utf8'))
      .toContain('different-owner-token')
  })

  it('attaches release failure without masking the primary publication failure', async () => {
    const outputDir = await temporaryOutputDirectory()
    const fileSystem = realPublisherFileSystem()
    let caught: unknown

    try {
      await publishEvaluationReports(
        outputDir,
        { json: '{}\n', markdown: 'safe\n' },
        {
          ownerToken: () => LOCK_OWNER_TOKEN,
          fileSystem: {
            ...fileSystem,
            async writeExclusive(path, content) {
              if (basename(path).startsWith('.evaluation.md.')) throw new Error(EXCEPTION_TEXT)
              await fileSystem.writeExclusive(path, content)
            },
            async rename(from, to) {
              if (basename(from) === LOCK_DIRECTORY
                && basename(to).startsWith(LOCK_RELEASE_PREFIX)) {
                throw new Error(`${EXCEPTION_TEXT}:${from}`)
              }
              await fileSystem.rename(from, to)
            }
          }
        }
      )
    } catch (error) {
      caught = error
    }

    expect(caught).toMatchObject({
      code: 'lakebase_evaluation_publish_failed',
      message: 'lakebase_evaluation_publish_failed',
      lockReleaseFailure: {
        code: 'lakebase_evaluation_publish_lock_release_failed',
        message: 'lakebase_evaluation_publish_lock_release_failed'
      }
    })
    expect(JSON.stringify(caught)).not.toContain(LOCK_OWNER_TOKEN)
    expect(JSON.stringify(caught)).not.toContain(EXCEPTION_TEXT)
    expect(JSON.stringify(caught)).not.toContain(outputDir)
  })

  it('waits for both staging writes to settle and removes every orphan on failure', async () => {
    const outputDir = await temporaryOutputDirectory()
    const fileSystem = realPublisherFileSystem()
    const delayedJsonWrite = deferred()
    const jsonWriteStarted = deferred()

    const publishing = publishEvaluationReports(
      outputDir,
      { json: '{"writer":"new"}\n', markdown: 'writer:new\n' },
      {
        fileSystem: {
          ...fileSystem,
          async writeExclusive(path, content) {
            if (basename(path) === LEASE_FILE || basename(path) === HEARTBEAT_FILE) {
              return fileSystem.writeExclusive(path, content)
            }
            if (basename(path).startsWith('.evaluation.json.')) {
              jsonWriteStarted.resolve()
              await delayedJsonWrite.promise
              return fileSystem.writeExclusive(path, content)
            }
            throw new Error(`${EXCEPTION_TEXT}:${path}`)
          }
        }
      }
    )
    await jsonWriteStarted.promise
    delayedJsonWrite.resolve()
    await expect(publishing).rejects.toMatchObject({
      code: 'lakebase_evaluation_publish_failed',
      message: 'lakebase_evaluation_publish_failed'
    })

    expect(await readdir(outputDir)).toEqual([])
  })

  it('restores the prior complete pair when the second final rename fails', async () => {
    const outputDir = await temporaryOutputDirectory()
    await writeFile(join(outputDir, 'evaluation.json'), '{"writer":"prior"}\n')
    await writeFile(join(outputDir, 'evaluation.md'), 'writer:prior\n')
    const fileSystem = realPublisherFileSystem()
    let failedMarkdownPublish = false

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"new"}\n', markdown: 'writer:new\n' },
      {
        fileSystem: {
          ...fileSystem,
          async rename(from, to) {
            if (!failedMarkdownPublish
              && basename(from).startsWith('.evaluation.md.')
              && basename(from).endsWith('.tmp')
              && basename(to) === 'evaluation.md') {
              failedMarkdownPublish = true
              throw new Error(`${EXCEPTION_TEXT}:${outputDir}`)
            }
            await fileSystem.rename(from, to)
          }
        }
      }
    )).rejects.toMatchObject({
      code: 'lakebase_evaluation_publish_failed',
      message: 'lakebase_evaluation_publish_failed'
    })

    expect(await readFile(join(outputDir, 'evaluation.json'), 'utf8')).toBe('{"writer":"prior"}\n')
    expect(await readFile(join(outputDir, 'evaluation.md'), 'utf8')).toBe('writer:prior\n')
    expect((await readdir(outputDir)).sort()).toEqual(['evaluation.json', 'evaluation.md'])
  })

  it.each([
    ['JSON', 'evaluation.json', '.evaluation.json.'],
    ['Markdown', 'evaluation.md', '.evaluation.md.']
  ])(
    'preserves recovery evidence when the %s backup restore fails',
    async (_label, failedFile, backupPrefix) => {
      const outputDir = await temporaryOutputDirectory()
      await writeFile(join(outputDir, 'evaluation.json'), '{"writer":"prior"}\n')
      await writeFile(join(outputDir, 'evaluation.md'), 'writer:prior\n')
      const fileSystem = realPublisherFileSystem()
      let finalPublishFailed = false

      await expect(publishEvaluationReports(
        outputDir,
        { json: '{"writer":"new"}\n', markdown: 'writer:new\n' },
        {
          ownerToken: () => LOCK_OWNER_TOKEN,
          fileSystem: {
            ...fileSystem,
            async rename(from, to) {
              if (!finalPublishFailed
                && basename(from).startsWith('.evaluation.md.')
                && basename(from).endsWith('.tmp')
                && basename(to) === 'evaluation.md') {
                finalPublishFailed = true
                throw new Error(EXCEPTION_TEXT)
              }
              if (basename(from).startsWith(backupPrefix)
                && basename(from).endsWith('.backup')
                && basename(to) === failedFile) {
                throw new Error(`${EXCEPTION_TEXT}:${from}`)
              }
              await fileSystem.rename(from, to)
            }
          }
        }
      )).rejects.toMatchObject({
        code: 'lakebase_evaluation_publish_rollback_failed',
        message: 'lakebase_evaluation_publish_rollback_failed'
      })

      const recovery = await publicationRecoveryEvidence(outputDir)
      const preservedBackup = recovery.files.find(file => (
        file.startsWith(backupPrefix) && file.endsWith('.backup')
      ))
      expect(preservedBackup).toBeDefined()
      expect(recovery.files).toContain('marker.json')
      const marker = await readFile(join(recovery.directoryPath, 'marker.json'), 'utf8')
      expect(JSON.parse(marker)).toEqual({ schemaVersion: 1, status: 'recovery_required' })
      expect(marker).not.toContain(LOCK_OWNER_TOKEN)
      expect(marker).not.toContain(EXCEPTION_TEXT)
      expect(marker).not.toContain(outputDir)

      await expect(publishEvaluationReports(
        outputDir,
        { json: '{"writer":"later"}\n', markdown: 'writer:later\n' }
      )).rejects.toMatchObject({
        code: 'lakebase_evaluation_recovery_required',
        message: 'lakebase_evaluation_recovery_required'
      })
      expect(await readdir(recovery.directoryPath)).toContain(preservedBackup)
    }
  )

  it('preserves recovery evidence when partial backup preparation cannot be restored', async () => {
    const outputDir = await temporaryOutputDirectory()
    await writeFile(join(outputDir, 'evaluation.json'), '{"writer":"prior"}\n')
    await writeFile(join(outputDir, 'evaluation.md'), 'writer:prior\n')
    const fileSystem = realPublisherFileSystem()

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"new"}\n', markdown: 'writer:new\n' },
      {
        fileSystem: {
          ...fileSystem,
          async rename(from, to) {
            if (basename(from) === 'evaluation.md' && basename(to).endsWith('.backup')) {
              throw new Error(EXCEPTION_TEXT)
            }
            if (basename(from).startsWith('.evaluation.json.')
              && basename(from).endsWith('.backup')
              && basename(to) === 'evaluation.json') {
              throw new Error(EXCEPTION_TEXT)
            }
            await fileSystem.rename(from, to)
          }
        }
      }
    )).rejects.toMatchObject({ code: 'lakebase_evaluation_publish_rollback_failed' })

    const recovery = await publicationRecoveryEvidence(outputDir)
    expect(recovery.files).toContain('marker.json')
    expect(recovery.files.some(file => (
      file.startsWith('.evaluation.json.') && file.endsWith('.backup')
    ))).toBe(true)
  })

  it('blocks later publication with a recovery directory when marker creation fails', async () => {
    const outputDir = await temporaryOutputDirectory()
    await writeFile(join(outputDir, 'evaluation.json'), '{"writer":"prior"}\n')
    await writeFile(join(outputDir, 'evaluation.md'), 'writer:prior\n')
    const fileSystem = realPublisherFileSystem()
    let finalPublishFailed = false

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"new"}\n', markdown: 'writer:new\n' },
      {
        fileSystem: {
          ...fileSystem,
          async writeExclusive(path, content) {
            if (basename(path) === RECOVERY_MARKER || basename(path) === 'marker.json') {
              throw new Error(EXCEPTION_TEXT)
            }
            await fileSystem.writeExclusive(path, content)
          },
          async rename(from, to) {
            if (!finalPublishFailed
              && basename(from).startsWith('.evaluation.md.')
              && basename(from).endsWith('.tmp')
              && basename(to) === 'evaluation.md') {
              finalPublishFailed = true
              throw new Error(EXCEPTION_TEXT)
            }
            if (basename(from).endsWith('.backup') && basename(to) === 'evaluation.json') {
              throw new Error(EXCEPTION_TEXT)
            }
            await fileSystem.rename(from, to)
          }
        }
      }
    )).rejects.toMatchObject({ code: 'lakebase_evaluation_publish_rollback_failed' })

    expect((await readdir(outputDir)).some(name => (
      name.startsWith(PUBLICATION_RECOVERY_PREFIX)
    ))).toBe(true)
    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"later"}\n', markdown: 'writer:later\n' }
    )).rejects.toMatchObject({ code: 'lakebase_evaluation_recovery_required' })
  })

  it('retains the recovery directory and blocks later publication when cleanup fails', async () => {
    const outputDir = await temporaryOutputDirectory()
    const fileSystem = realPublisherFileSystem()

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"new"}\n', markdown: 'writer:new\n' },
      {
        fileSystem: {
          ...fileSystem,
          async remove(path) {
            if (basename(path).startsWith(PUBLICATION_RECOVERY_PREFIX)) {
              throw new Error(EXCEPTION_TEXT)
            }
            await fileSystem.remove(path)
          }
        }
      }
    )).rejects.toMatchObject({ code: 'lakebase_evaluation_publish_cleanup_failed' })

    expect((await readdir(outputDir)).some(name => (
      name.startsWith(PUBLICATION_RECOVERY_PREFIX)
    ))).toBe(true)
    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"later"}\n', markdown: 'writer:later\n' }
    )).rejects.toMatchObject({ code: 'lakebase_evaluation_recovery_required' })
  })

  it('surfaces cleanup failure, preserves the backup, and blocks subsequent publication', async () => {
    const outputDir = await temporaryOutputDirectory()
    await writeFile(join(outputDir, 'evaluation.json'), '{"writer":"prior"}\n')
    await writeFile(join(outputDir, 'evaluation.md'), 'writer:prior\n')
    const fileSystem = realPublisherFileSystem()

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"new"}\n', markdown: 'writer:new\n' },
      {
        ownerToken: () => LOCK_OWNER_TOKEN,
        fileSystem: {
          ...fileSystem,
          async remove(path) {
            if (basename(path).startsWith('.evaluation.json.')
              && basename(path).endsWith('.backup')) {
              throw new Error(`${EXCEPTION_TEXT}:${path}`)
            }
            await fileSystem.remove(path)
          }
        }
      }
    )).rejects.toMatchObject({
      code: 'lakebase_evaluation_publish_cleanup_failed',
      message: 'lakebase_evaluation_publish_cleanup_failed'
    })

    const recovery = await publicationRecoveryEvidence(outputDir)
    const preservedBackup = recovery.files.find(file => (
      file.startsWith('.evaluation.json.') && file.endsWith('.backup')
    ))
    expect(preservedBackup).toBeDefined()
    expect(recovery.files).toContain('marker.json')
    expect(await readFile(join(outputDir, 'evaluation.json'), 'utf8')).toContain('"new"')
    expect(await readFile(join(outputDir, 'evaluation.md'), 'utf8')).toContain('new')

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"later"}\n', markdown: 'writer:later\n' }
    )).rejects.toMatchObject({ code: 'lakebase_evaluation_recovery_required' })
    expect(await readdir(recovery.directoryPath)).toContain(preservedBackup)
  })

  it('removes the newly published first file when the second final rename fails without a prior pair', async () => {
    const outputDir = await temporaryOutputDirectory()
    const fileSystem = realPublisherFileSystem()

    await expect(publishEvaluationReports(
      outputDir,
      { json: '{"writer":"new"}\n', markdown: 'writer:new\n' },
      {
        fileSystem: {
          ...fileSystem,
          async rename(from, to) {
            if (basename(from).startsWith('.evaluation.md.')
              && basename(from).endsWith('.tmp')
              && basename(to) === 'evaluation.md') {
              throw new Error(EXCEPTION_TEXT)
            }
            await fileSystem.rename(from, to)
          }
        }
      }
    )).rejects.toMatchObject({ code: 'lakebase_evaluation_publish_failed' })

    expect(await readdir(outputDir)).toEqual([])
  })

  it.each(['evaluation.json', 'evaluation.md'])(
    'preserves the prior complete pair when backing up %s fails',
    async (failedFile) => {
      const outputDir = await temporaryOutputDirectory()
      await writeFile(join(outputDir, 'evaluation.json'), '{"writer":"prior"}\n')
      await writeFile(join(outputDir, 'evaluation.md'), 'writer:prior\n')
      const fileSystem = realPublisherFileSystem()
      let injected = false

      await expect(publishEvaluationReports(
        outputDir,
        { json: '{"writer":"new"}\n', markdown: 'writer:new\n' },
        {
          fileSystem: {
            ...fileSystem,
            async rename(from, to) {
              if (!injected && basename(from) === failedFile && basename(to).endsWith('.backup')) {
                injected = true
                throw new Error(EXCEPTION_TEXT)
              }
              await fileSystem.rename(from, to)
            }
          }
        }
      )).rejects.toMatchObject({ code: 'lakebase_evaluation_publish_failed' })

      expect(await readFile(join(outputDir, 'evaluation.json'), 'utf8')).toBe('{"writer":"prior"}\n')
      expect(await readFile(join(outputDir, 'evaluation.md'), 'utf8')).toBe('writer:prior\n')
      expect((await readdir(outputDir)).sort()).toEqual(['evaluation.json', 'evaluation.md'])
    }
  )

  it('serializes concurrent writers so the final JSON and Markdown are one matched pair', async () => {
    const outputDir = await temporaryOutputDirectory()
    const fileSystem = realPublisherFileSystem()
    const firstJsonPublished = deferred()
    const releaseFirstPublisher = deferred()
    const secondLockAttempted = deferred()
    let lockAttempts = 0
    let jsonPublishes = 0
    const controlledFileSystem: EvaluationPublisherFileSystem = {
      ...fileSystem,
      async createSymlink(target, path) {
        if (basename(path) === LOCK_DIRECTORY) {
          lockAttempts += 1
          if (lockAttempts > 1) secondLockAttempted.resolve()
        }
        await fileSystem.createSymlink(target, path)
      },
      async rename(from, to) {
        await fileSystem.rename(from, to)
        if (basename(from).startsWith('.evaluation.json.')
          && basename(from).endsWith('.tmp')
          && basename(to) === 'evaluation.json') {
          jsonPublishes += 1
          if (jsonPublishes === 1) {
            firstJsonPublished.resolve()
            await releaseFirstPublisher.promise
          }
        }
      }
    }

    const first = publishEvaluationReports(
      outputDir,
      { json: '{"writer":"first"}\n', markdown: 'writer:first\n' },
      { fileSystem: controlledFileSystem }
    )
    await firstJsonPublished.promise
    const second = publishEvaluationReports(
      outputDir,
      { json: '{"writer":"second"}\n', markdown: 'writer:second\n' },
      { fileSystem: controlledFileSystem }
    )
    await secondLockAttempted.promise
    releaseFirstPublisher.resolve()
    await Promise.all([first, second])

    const json = JSON.parse(await readFile(join(outputDir, 'evaluation.json'), 'utf8')) as { writer: string }
    const markdown = await readFile(join(outputDir, 'evaluation.md'), 'utf8')
    expect(markdown).toBe(`writer:${json.writer}\n`)
    expect(json.writer).toBe('second')
    expect((await readdir(outputDir)).sort()).toEqual(['evaluation.json', 'evaluation.md'])
  })
})

describe('Lakebase evaluation evidence', () => {
  it('runs bounded relevance and latency searches and atomically emits redacted review evidence', async () => {
    const fixture = await loadFixture()
    const outputDir = await temporaryOutputDirectory()
    const relevantIdsByTerm = new Map(fixture.queries.map(query => [query.query, query.relevantIds]))
    let elapsed = 0
    let legacyCalls = 0
    let bm25Calls = 0
    const result = await runLakebaseEvaluation(
      { runs: 2, coldStart: true, outputDir },
      injectedDependencies(fixture, {
        nowMs: () => elapsed,
        searchLegacy: async (_database, _clientId, term) => {
          legacyCalls += 1
          elapsed += 10
          return (relevantIdsByTerm.get(term) || []).map(hit)
        },
        searchBm25: async (_database, _clientId, term) => {
          bm25Calls += 1
          elapsed += 5
          return (relevantIdsByTerm.get(term) || []).map(hit)
        }
      })
    )

    expect(legacyCalls).toBe(fixture.queries.length * 3)
    expect(bm25Calls).toBe(fixture.queries.length * 3)
    expect(result.exitCode).toBe(0)
    expect(result.report).toMatchObject({
      schemaVersion: 1,
      generatedAt: '2026-08-08T01:02:03.000Z',
      corpus: 'synthetic_crm_v1',
      identifiersEmitted: false,
      rawQueriesEmitted: false,
      cloudflareVectorizeChanged: false,
      productionDatabaseChanged: false,
      coldStartOperatorAsserted: true,
      runs: 2,
      gate: { status: 'eligible_for_hybrid_review', passed: true, blockers: [] }
    })
    expect(result.report.engines.legacy).toMatchObject({
      precisionAt5: expect.any(Number),
      recallAt10: expect.any(Number),
      mrr: expect.any(Number),
      p50: 10,
      p95: 10,
      max: 10,
      failures: 0,
      fallbacks: 0,
      crossClientLeakage: 0,
      softDeleteLeakage: 0,
      latencySampleCount: fixture.queries.length * 2
    })
    expect(result.report.engines.bm25).toMatchObject({ p50: 5, p95: 5, max: 5 })
    expect(result.report.overlap).toMatchObject({
      meanAt10: 1,
      byQuery: fixture.queries.map(query => ({ queryId: query.id, overlapAt10: 1 }))
    })

    const expectedHash = createHash('sha256')
      .update(fixture.queries[0]!.relevantIds[0]!)
      .digest('hex')
    const files = await readdir(outputDir)
    const json = await readFile(join(outputDir, 'evaluation.json'), 'utf8')
    const markdown = await readFile(join(outputDir, 'evaluation.md'), 'utf8')
    const evidence = `${json}\n${markdown}`

    expect(files.sort()).toEqual(['evaluation.json', 'evaluation.md'])
    expect(evidence).toContain(fixture.queries[0]!.id)
    expect(evidence).toContain(expectedHash)
    expect(evidence).toContain('Precision@5')
    expect(evidence).toContain('Recall@10')
    expect(evidence).toContain('MRR')
    expect(evidence).toContain('operator assertion')
    for (const content of [json, markdown]) {
      for (const sensitiveValue of [
        SENSITIVE_TITLE,
        PROJECT_ID,
        ENDPOINT_ID,
        DATABASE_HOST,
        DATABASE_URL,
        API_KEY,
        OPERATOR_EMAIL,
        HIT_EMAIL,
        PRODUCTION_PROJECT_ID,
        HTTP_URL
      ]) expect(content).not.toContain(sensitiveValue)
      for (const query of fixture.queries) expect(content).not.toContain(query.query)
      for (const document of fixture.documents) expect(content).not.toContain(document.id)
      expect(content).not.toMatch(/postgres(?:ql)?:\/\//i)
      expect(content).not.toMatch(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)
      expect(content).not.toMatch(/https?:\/\//i)
    }
    expect(markdown).toContain('Passing grants review eligibility only')
  })

  it('blocks one cross-client result from the relevance-only call', async () => {
    const fixture = await loadFixture()
    const outputDir = await temporaryOutputDirectory()
    const otherClientId = fixture.documents.find(document => (
      document.clientId !== fixture.queries[0]!.clientId
    ))!.id
    const clock = { value: 0 }
    const result = await runLakebaseEvaluation(
      { runs: 1, coldStart: false, outputDir },
      injectedDependencies(fixture, {
        nowMs: () => clock.value,
        searchLegacy: timedRelevantSearch(fixture, clock, 10),
        searchBm25: timedRelevantSearch(fixture, clock, 5, ({ term, call, baseline }) => (
          term === fixture.queries[0]!.query && call === 1
            ? [...baseline, hit(otherClientId)]
            : baseline
        ))
      })
    )

    expect(result.exitCode).toBe(1)
    expect(result.report.gate.blockers).toEqual(['cross_client_leakage'])
    expect(result.report.engines.bm25).toMatchObject({
      crossClientLeakage: 1,
      softDeleteLeakage: 0,
      failures: 0,
      fallbacks: 0
    })
  })

  it('blocks one deleted result from a latency-only repetition', async () => {
    const fixture = await loadFixture()
    const outputDir = await temporaryOutputDirectory()
    const deletedId = fixture.documents.find(document => document.deleted)!.id
    const clock = { value: 0 }
    const result = await runLakebaseEvaluation(
      { runs: 1, coldStart: false, outputDir },
      injectedDependencies(fixture, {
        nowMs: () => clock.value,
        searchLegacy: timedRelevantSearch(fixture, clock, 10),
        searchBm25: timedRelevantSearch(fixture, clock, 5, ({ term, call, baseline }) => (
          term === fixture.queries[0]!.query && call === 2
            ? [...baseline, hit(deletedId)]
            : baseline
        ))
      })
    )

    expect(result.exitCode).toBe(1)
    expect(result.report.gate.blockers).toEqual(['soft_delete_leakage'])
    expect(result.report.engines.bm25).toMatchObject({
      crossClientLeakage: 0,
      softDeleteLeakage: 1,
      failures: 0,
      fallbacks: 0
    })
  })

  it('counts one latency-only failure exactly and redacts its exception from both reports', async () => {
    const fixture = await loadFixture()
    const outputDir = await temporaryOutputDirectory()
    const clock = { value: 0 }
    const result = await runLakebaseEvaluation(
      { runs: 1, coldStart: false, outputDir },
      injectedDependencies(fixture, {
        nowMs: () => clock.value,
        searchLegacy: timedRelevantSearch(fixture, clock, 10),
        searchBm25: timedRelevantSearch(fixture, clock, 5, ({ term, call, baseline }) => {
          if (term === fixture.queries[0]!.query && call === 2) throw new Error(EXCEPTION_TEXT)
          return baseline
        })
      })
    )

    expect(result.exitCode).toBe(1)
    expect(result.report.gate.blockers).toEqual(['query_failure'])
    expect(result.report.engines.bm25).toMatchObject({
      crossClientLeakage: 0,
      softDeleteLeakage: 0,
      failures: 1,
      fallbacks: 0
    })
    for (const file of ['evaluation.json', 'evaluation.md']) {
      expect(await readFile(join(outputDir, file), 'utf8')).not.toContain(EXCEPTION_TEXT)
    }
  })

  it('counts one latency-only fallback exactly and independently forces a hold exit', async () => {
    const fixture = await loadFixture()
    const outputDir = await temporaryOutputDirectory()
    const clock = { value: 0 }
    const result = await runLakebaseEvaluation(
      { runs: 1, coldStart: false, outputDir },
      injectedDependencies(fixture, {
        nowMs: () => clock.value,
        searchLegacy: timedRelevantSearch(fixture, clock, 10),
        searchBm25: timedRelevantSearch(fixture, clock, 5, ({ term, call, baseline }) => (
          term === fixture.queries[0]!.query && call === 2
            ? { hits: baseline, fallback: true }
            : baseline
        ))
      })
    )

    expect(result.exitCode).toBe(1)
    expect(result.report.gate.blockers).toEqual(['query_failure'])
    expect(result.report.engines.bm25).toMatchObject({
      crossClientLeakage: 0,
      softDeleteLeakage: 0,
      failures: 0,
      fallbacks: 1
    })
  })

  it('rejects an out-of-bounds programmatic run before touching a target or output', async () => {
    const fixture = await loadFixture()
    const outputDir = join(await temporaryOutputDirectory(), 'must-not-exist')
    let targetResolutionAttempted = false

    await expect(runLakebaseEvaluation(
      { runs: 501, coldStart: false, outputDir },
      injectedDependencies(fixture, {
        resolveTarget: () => {
          targetResolutionAttempted = true
          throw new Error('must not run')
        }
      })
    )).rejects.toThrow('Usage:')
    expect(targetResolutionAttempted).toBe(false)
    await expect(readdir(outputDir)).rejects.toThrow()
  })
})
