import { createHash, randomUUID } from 'node:crypto'
import {
  lstat as fsLstat,
  mkdir as fsMkdir,
  readFile,
  readlink as fsReadlink,
  readdir as fsReaddir,
  rename as fsRename,
  rm as fsRm,
  symlink as fsSymlink,
  unlink as fsUnlink,
  writeFile as fsWriteFile
} from 'node:fs/promises'
import { hostname as systemHostname } from 'node:os'
import { basename, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import {
  resolvePilotTarget,
  type LakebasePilotTarget
} from './contracts'
import {
  closePilotDatabasePreservingError,
  createPilotDatabase,
  type PilotDatabase
} from './database'
import {
  decideBm25Gate,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  summarizeEngine,
  type Bm25GateDecision,
  type EngineMetricSummary,
  type OrderedSearchResults,
  type RetrievalJudgement
} from './metrics'
import {
  searchBm25Pilot,
  searchLegacyPilot,
  type PilotSearchHit
} from './search'
import type { LakebasePilotFixture } from './setup'

const DEFAULT_RUNS = 20
const MIN_RUNS = 1
const MAX_RUNS = 500
const DEFAULT_OUTPUT_DIRECTORY = '.data/lakebase-pilot'
const RESULT_LIMIT = 20
const USAGE = 'Usage: evaluate.ts [--runs 1..500] [--output DIR] [--cold-start]'

export interface LakebaseEvaluateOptions {
  runs: number
  coldStart: boolean
  outputDir: string
}

export interface EvaluationSearchOutcome {
  hits: PilotSearchHit[]
  fallback: boolean
}

export type EvaluationSearch = (
  database: PilotDatabase,
  clientId: string,
  term: string,
  limit: number
) => Promise<PilotSearchHit[] | EvaluationSearchOutcome>

export interface LakebaseEvaluationDependencies {
  env?: Record<string, string | undefined>
  resolveTarget?: typeof resolvePilotTarget
  createDatabase?: (target: LakebasePilotTarget) => Promise<PilotDatabase>
  fixture?: LakebasePilotFixture
  loadFixture?: () => Promise<LakebasePilotFixture>
  searchLegacy?: EvaluationSearch
  searchBm25?: EvaluationSearch
  now?: () => Date
  nowMs?: () => number
  publishReports?: EvaluationReportPublisher
  publisherDependencies?: EvaluationPublisherDependencies
}

export interface EvaluationReportPayload {
  json: string
  markdown: string
}

export interface EvaluationReportPaths {
  json: string
  markdown: string
}

export interface EvaluationPublisherFileSystem {
  makeDirectory: (path: string, recursive: boolean) => Promise<void>
  writeExclusive: (path: string, content: string) => Promise<void>
  createSymlink: (target: string, path: string) => Promise<void>
  readLink: (path: string) => Promise<string>
  readText: (path: string) => Promise<string>
  readMetadata: (path: string) => Promise<{
    modifiedAtEpochMs: number
    device: number
    inode: number
  }>
  listDirectory: (path: string) => Promise<string[]>
  rename: (from: string, to: string) => Promise<void>
  unlink: (path: string) => Promise<void>
  remove: (path: string) => Promise<void>
}

export interface EvaluationLockLease {
  schemaVersion: 1
  ownerToken: string
  acquiredAtEpochMs: number
  processId: number
  hostname: string
  ownerDirectoryName?: string
}

interface EvaluationLockHeartbeat {
  schemaVersion: 1
  ownerToken: string
  renewedAtEpochMs: number
}

export interface EvaluationPublisherDependencies {
  fileSystem?: EvaluationPublisherFileSystem
  sleep?: (milliseconds: number) => Promise<void>
  now?: () => number
  ownerToken?: () => string
  leaseDurationMs?: number
  heartbeatIntervalMs?: number
  /** Trusted fencing proof. Returning true authorizes destructive stale-owner recovery. */
  ownerDefinitelyGone?: (lease: EvaluationLockLease) => boolean
}

export type EvaluationReportPublisher = (
  outputDir: string,
  payload: EvaluationReportPayload
) => Promise<EvaluationReportPaths>

export class LakebaseEvaluationPublishError extends Error {
  readonly lockReleaseFailure?: LakebaseEvaluationPublishError
  readonly cleanupFailure?: LakebaseEvaluationPublishError

  constructor(readonly code:
    | 'lakebase_evaluation_publish_failed'
    | 'lakebase_evaluation_publish_lock_unavailable'
    | 'lakebase_evaluation_publish_lock_release_failed'
    | 'lakebase_evaluation_publish_lock_lost'
    | 'lakebase_evaluation_publish_rollback_failed'
    | 'lakebase_evaluation_publish_cleanup_failed'
    | 'lakebase_evaluation_recovery_required'
  ) {
    super(code)
    this.name = 'LakebaseEvaluationPublishError'
  }
}

export interface ReportedEngineMetrics extends EngineMetricSummary {
  latencySampleCount: number
}

export interface LakebaseEvaluationQueryReport {
  queryId: string
  legacy: {
    resultIdHashes: string[]
    precisionAt5: number
    recallAt10: number
    mrr: number
  }
  bm25: {
    resultIdHashes: string[]
    precisionAt5: number
    recallAt10: number
    mrr: number
  }
  overlapAt10: number
}

export interface LakebaseEvaluationReport {
  schemaVersion: 1
  generatedAt: string
  corpus: 'synthetic_crm_v1'
  identifiersEmitted: false
  rawQueriesEmitted: false
  cloudflareVectorizeChanged: false
  productionDatabaseChanged: false
  coldStartOperatorAsserted: boolean
  runs: number
  engines: {
    legacy: ReportedEngineMetrics
    bm25: ReportedEngineMetrics
  }
  overlap: {
    meanAt10: number
    byQuery: Array<{ queryId: string, overlapAt10: number }>
  }
  queries: LakebaseEvaluationQueryReport[]
  gate: Bm25GateDecision
}

export interface LakebaseEvaluationResult {
  exitCode: 0 | 1
  report: LakebaseEvaluationReport
  paths: EvaluationReportPaths
}

interface EngineEvaluation {
  results: OrderedSearchResults[]
  latencySamples: number[]
  failures: number
  fallbacks: number
  crossClientLeakage: number
  softDeleteLeakage: number
}

interface NormalizedSearchOutcome {
  hits: PilotSearchHit[]
  fallback: boolean
}

function usageError(): Error {
  return new Error(USAGE)
}

function validRuns(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_RUNS && value <= MAX_RUNS
}

function validateOptions(options: LakebaseEvaluateOptions): void {
  if (!validRuns(options.runs) || !options.outputDir.trim()) throw usageError()
}

export function parseEvaluateArgs(args: string[]): LakebaseEvaluateOptions {
  let runs = DEFAULT_RUNS
  let coldStart = false
  let outputDir = DEFAULT_OUTPUT_DIRECTORY
  const seen = new Set<string>()

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--cold-start') {
      if (seen.has(argument)) throw usageError()
      seen.add(argument)
      coldStart = true
      continue
    }
    if (argument !== '--runs' && argument !== '--output') throw usageError()
    if (seen.has(argument)) throw usageError()
    seen.add(argument)

    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw usageError()
    index += 1
    if (argument === '--runs') {
      if (!/^\d+$/.test(value)) throw usageError()
      runs = Number(value)
      if (!validRuns(runs)) throw usageError()
    } else {
      outputDir = value
    }
  }

  const options = { runs, coldStart, outputDir }
  validateOptions(options)
  return options
}

async function readDefaultFixture(): Promise<LakebasePilotFixture> {
  const json = await readFile(new URL('../../test/fixtures/lakebase-crm-search.json', import.meta.url), 'utf8')
  return JSON.parse(json) as LakebasePilotFixture
}

function newEngineEvaluation(): EngineEvaluation {
  return {
    results: [],
    latencySamples: [],
    failures: 0,
    fallbacks: 0,
    crossClientLeakage: 0,
    softDeleteLeakage: 0
  }
}

function normalizeSearchOutcome(
  result: PilotSearchHit[] | EvaluationSearchOutcome
): NormalizedSearchOutcome {
  if (Array.isArray(result)) return { hits: result, fallback: false }
  if (!result || !Array.isArray(result.hits) || typeof result.fallback !== 'boolean') {
    throw new TypeError('invalid evaluation search outcome')
  }
  return result
}

function recordLeakage(
  engine: EngineEvaluation,
  hits: readonly PilotSearchHit[],
  clientId: string,
  documentsById: ReadonlyMap<string, LakebasePilotFixture['documents'][number]>
): void {
  for (const hit of hits) {
    const document = documentsById.get(hit.id)
    if (!document || document.clientId !== clientId) engine.crossClientLeakage += 1
    if (document?.deleted) engine.softDeleteLeakage += 1
  }
}

async function executeSearch(
  engine: EngineEvaluation,
  search: EvaluationSearch,
  database: PilotDatabase,
  clientId: string,
  term: string,
  documentsById: ReadonlyMap<string, LakebasePilotFixture['documents'][number]>
): Promise<PilotSearchHit[]> {
  try {
    const outcome = normalizeSearchOutcome(await search(database, clientId, term, RESULT_LIMIT))
    if (outcome.fallback) engine.fallbacks += 1
    recordLeakage(engine, outcome.hits, clientId, documentsById)
    return outcome.hits
  } catch {
    engine.failures += 1
    return []
  }
}

async function recordLatencySearch(
  engine: EngineEvaluation,
  search: EvaluationSearch,
  database: PilotDatabase,
  clientId: string,
  term: string,
  documentsById: ReadonlyMap<string, LakebasePilotFixture['documents'][number]>,
  nowMs: () => number
): Promise<void> {
  const startedAt = nowMs()
  await executeSearch(engine, search, database, clientId, term, documentsById)
  const latency = nowMs() - startedAt
  if (!Number.isFinite(latency) || latency < 0) throw new TypeError('evaluation clock must be monotonic')
  engine.latencySamples.push(latency)
}

function uniqueTopIds(ids: readonly string[], limit: number): Set<string> {
  return new Set(ids.slice(0, limit))
}

function overlapAt10(legacyIds: readonly string[], bm25Ids: readonly string[]): number {
  const legacy = uniqueTopIds(legacyIds, 10)
  const bm25 = uniqueTopIds(bm25Ids, 10)
  const union = new Set([...legacy, ...bm25])
  if (union.size === 0) return 1
  let intersectionSize = 0
  for (const id of legacy) {
    if (bm25.has(id)) intersectionSize += 1
  }
  return intersectionSize / union.size
}

function hashResultId(id: string): string {
  return createHash('sha256').update(id).digest('hex')
}

function queryReport(
  judgement: RetrievalJudgement,
  legacyIds: readonly string[],
  bm25Ids: readonly string[]
): LakebaseEvaluationQueryReport {
  return {
    queryId: judgement.queryId,
    legacy: {
      resultIdHashes: legacyIds.map(hashResultId),
      precisionAt5: precisionAtK(legacyIds, judgement.relevantIds, 5),
      recallAt10: recallAtK(legacyIds, judgement.relevantIds, 10),
      mrr: reciprocalRank(legacyIds, judgement.relevantIds)
    },
    bm25: {
      resultIdHashes: bm25Ids.map(hashResultId),
      precisionAt5: precisionAtK(bm25Ids, judgement.relevantIds, 5),
      recallAt10: recallAtK(bm25Ids, judgement.relevantIds, 10),
      mrr: reciprocalRank(bm25Ids, judgement.relevantIds)
    },
    overlapAt10: overlapAt10(legacyIds, bm25Ids)
  }
}

function reportMetrics(
  evaluation: EngineEvaluation,
  judgements: readonly RetrievalJudgement[]
): ReportedEngineMetrics {
  return {
    ...summarizeEngine({
      judgements,
      results: evaluation.results,
      latencySamples: evaluation.latencySamples,
      failures: evaluation.failures,
      fallbacks: evaluation.fallbacks,
      crossClientLeakage: evaluation.crossClientLeakage,
      softDeleteLeakage: evaluation.softDeleteLeakage
    }),
    latencySampleCount: evaluation.latencySamples.length
  }
}

function markdownReport(report: LakebaseEvaluationReport): string {
  const metricRow = (name: string, metrics: ReportedEngineMetrics) => (
    `| ${name} | ${metrics.p50} | ${metrics.p95} | ${metrics.max} | ${metrics.precisionAt5} | ${metrics.recallAt10} | ${metrics.mrr} | ${metrics.failures} | ${metrics.fallbacks} | ${metrics.crossClientLeakage} | ${metrics.softDeleteLeakage} |`
  )
  const queryRows = report.queries.map(query => (
    `| ${query.queryId} | ${query.legacy.resultIdHashes.join(', ')} | ${query.bm25.resultIdHashes.join(', ')} | ${query.legacy.precisionAt5} | ${query.legacy.recallAt10} | ${query.legacy.mrr} | ${query.bm25.precisionAt5} | ${query.bm25.recallAt10} | ${query.bm25.mrr} | ${query.overlapAt10} |`
  ))

  return [
    '# Lakebase CRM Search Pilot Evaluation',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Cold-start label: ${report.coldStartOperatorAsserted ? 'operator assertion recorded' : 'not asserted'}. Compute lifecycle was not controlled by this evaluator.`,
    '',
    '## Engine metrics',
    '',
    '| Engine | p50 (ms) | p95 (ms) | max (ms) | Precision@5 | Recall@10 | MRR | Failures | Fallbacks | Cross-client leakage | Soft-delete leakage |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    metricRow('GIN legacy', report.engines.legacy),
    metricRow('BM25', report.engines.bm25),
    '',
    '## Per-query redacted evidence',
    '',
    '| Query ID | GIN result SHA-256 hashes | BM25 result SHA-256 hashes | GIN Precision@5 | GIN Recall@10 | GIN MRR | BM25 Precision@5 | BM25 Recall@10 | BM25 MRR | Jaccard overlap@10 |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...queryRows,
    '',
    `Mean Jaccard overlap@10: ${report.overlap.meanAt10}`,
    '',
    '## Gate',
    '',
    `Status: ${report.gate.status}`,
    '',
    `Blockers: ${report.gate.blockers.length > 0 ? report.gate.blockers.join(', ') : 'none'}`,
    '',
    'Passing grants review eligibility only; it does not activate hybrid search or change production behavior.',
    ''
  ].join('\n')
}

const LOCK_RETRY_MILLISECONDS = 10
const MAX_LOCK_ATTEMPTS = 500
const DEFAULT_LEASE_DURATION_MILLISECONDS = 30_000
const LOCK_DIRECTORY_NAME = '.evaluation.lock'
const LEASE_FILE_NAME = 'lease.json'
const HEARTBEAT_FILE_NAME = 'heartbeat.json'
const LOCK_OWNER_DIRECTORY_PREFIX = '.evaluation.lock.owner.'
const LOCK_RECOVERY_SENTINEL_NAME = '.evaluation.lock.recovery'
const LOCK_RECOVERY_OWNER_PREFIX = '.evaluation.lock.recovery-owner.'
const LOCK_STALE_PREFIX = '.evaluation.lock.stale.'
const LOCK_RELEASE_PREFIX = '.evaluation.lock.release.'
const LOCK_RECOVERY_RELEASE_PREFIX = '.evaluation.lock.recovery-release.'
const RECOVERY_MARKER_NAME = '.evaluation.recovery.json'
const PUBLICATION_RECOVERY_DIRECTORY_PREFIX = '.evaluation.publish-recovery.'
const PUBLICATION_RECOVERY_STATE_NAME = 'state.json'
const PUBLICATION_RECOVERY_MARKER_NAME = 'marker.json'

const defaultPublisherFileSystem: EvaluationPublisherFileSystem = {
  async makeDirectory(path, recursive) {
    await fsMkdir(path, { recursive })
  },
  async writeExclusive(path, content) {
    await fsWriteFile(path, content, { flag: 'wx' })
  },
  async createSymlink(target, path) {
    await fsSymlink(target, path, 'dir')
  },
  readLink: fsReadlink,
  readText: path => readFile(path, 'utf8'),
  async readMetadata(path) {
    const metadata = await fsLstat(path)
    return {
      modifiedAtEpochMs: metadata.mtimeMs,
      device: metadata.dev,
      inode: metadata.ino
    }
  },
  listDirectory: path => fsReaddir(path),
  async rename(from, to) {
    await fsRename(from, to)
  },
  async unlink(path) {
    await fsUnlink(path)
  },
  async remove(path) {
    await fsRm(path, { recursive: true, force: true })
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function parseLockLease(raw: string): EvaluationLockLease | null {
  try {
    const value = JSON.parse(raw) as Partial<EvaluationLockLease>
    if (value.schemaVersion !== 1
      || typeof value.ownerToken !== 'string'
      || !value.ownerToken
      || !Number.isFinite(value.acquiredAtEpochMs)
      || !Number.isInteger(value.processId)
      || value.processId! < 1
      || typeof value.hostname !== 'string'
      || !value.hostname) return null
    return value as EvaluationLockLease
  } catch {
    return null
  }
}

function parseLockHeartbeat(raw: string): EvaluationLockHeartbeat | null {
  try {
    const value = JSON.parse(raw) as Partial<EvaluationLockHeartbeat>
    if (value.schemaVersion !== 1
      || typeof value.ownerToken !== 'string'
      || !value.ownerToken
      || !Number.isFinite(value.renewedAtEpochMs)) return null
    return value as EvaluationLockHeartbeat
  } catch {
    return null
  }
}

async function readOptionalText(
  fileSystem: EvaluationPublisherFileSystem,
  path: string
): Promise<string | null> {
  try {
    return await fileSystem.readText(path)
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')
      || hasErrorCode(error, 'EISDIR')
      || hasErrorCode(error, 'ENOTDIR')) return null
    throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
  }
}

async function readOptionalMetadata(
  fileSystem: EvaluationPublisherFileSystem,
  path: string
): Promise<{
  modifiedAtEpochMs: number
  device: number
  inode: number
} | null> {
  try {
    return await fileSystem.readMetadata(path)
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return null
    throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
  }
}

async function readOptionalLink(
  fileSystem: EvaluationPublisherFileSystem,
  path: string
): Promise<string | null> {
  try {
    return await fileSystem.readLink(path)
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'EINVAL')) return null
    throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
  }
}

interface LockSnapshot {
  lease: EvaluationLockLease | null
  leaseRaw: string | null
  heartbeat: EvaluationLockHeartbeat | null
  heartbeatRaw: string | null
  linkTarget: string | null
  modifiedAtEpochMs: number
  device: number
  inode: number
}

async function readLockSnapshot(
  fileSystem: EvaluationPublisherFileSystem,
  lockPath: string
): Promise<LockSnapshot | null> {
  const metadata = await readOptionalMetadata(fileSystem, lockPath)
  if (!metadata) return null
  const linkTarget = await readOptionalLink(fileSystem, lockPath)
  const leaseRaw = await readOptionalText(fileSystem, join(lockPath, LEASE_FILE_NAME))
  const heartbeatRaw = await readOptionalText(fileSystem, join(lockPath, HEARTBEAT_FILE_NAME))
  return {
    lease: leaseRaw === null ? null : parseLockLease(leaseRaw),
    leaseRaw,
    heartbeat: heartbeatRaw === null ? null : parseLockHeartbeat(heartbeatRaw),
    heartbeatRaw,
    linkTarget,
    modifiedAtEpochMs: metadata.modifiedAtEpochMs,
    device: metadata.device,
    inode: metadata.inode
  }
}

interface PublicationLockOptions {
  now: () => number
  ownerToken: string
  leaseDurationMs: number
  heartbeatIntervalMs: number
  ownerDefinitelyGone: (lease: EvaluationLockLease) => boolean
}

interface PublicationLockOwnership {
  lockPath: string
  ownerToken: string
  ownerDirectoryPath: string
  ownerDirectoryName: string
  releasePath: string
}

interface LockRecoveryOwnership {
  sentinelPath: string
  ownerToken: string
  ownerDirectoryPath: string
  ownerDirectoryName: string
  staleLockPath: string
  releaseSentinelPath: string
}

function ownerFingerprint(ownerToken: string): string {
  return createHash('sha256').update(ownerToken).digest('hex').slice(0, 24)
}

function ownerProcessDefinitelyGone(lease: EvaluationLockLease): boolean {
  if (lease.hostname !== systemHostname()) return false
  try {
    process.kill(lease.processId, 0)
    return false
  } catch (error) {
    return hasErrorCode(error, 'ESRCH')
  }
}

function safeOwnerArtifactName(
  snapshot: LockSnapshot,
  prefix: string
): string | null {
  if (!snapshot.lease || !snapshot.linkTarget) return null
  const expected = `${prefix}${ownerFingerprint(snapshot.lease.ownerToken)}`
  if (snapshot.linkTarget !== expected
    || snapshot.lease.ownerDirectoryName !== expected
    || snapshot.linkTarget !== basename(snapshot.linkTarget)) return null
  return expected
}

function snapshotOwnedBy(
  snapshot: LockSnapshot | null,
  ownerToken: string,
  ownerDirectoryName: string,
  prefix: string
): boolean {
  return snapshot?.lease?.ownerToken === ownerToken
    && safeOwnerArtifactName(snapshot, prefix) === ownerDirectoryName
}

function leaseForOwner(
  options: PublicationLockOptions,
  ownerDirectoryName: string
): EvaluationLockLease {
  return {
    schemaVersion: 1,
    ownerToken: options.ownerToken,
    acquiredAtEpochMs: options.now(),
    processId: process.pid,
    hostname: systemHostname(),
    ownerDirectoryName
  }
}

function heartbeatForOwner(options: PublicationLockOptions): EvaluationLockHeartbeat {
  return {
    schemaVersion: 1,
    ownerToken: options.ownerToken,
    renewedAtEpochMs: options.now()
  }
}

async function prepareLockCandidate(
  fileSystem: EvaluationPublisherFileSystem,
  outputDir: string,
  lockPath: string,
  options: PublicationLockOptions
): Promise<PublicationLockOwnership> {
  const ownerDirectoryName = `${LOCK_OWNER_DIRECTORY_PREFIX}${ownerFingerprint(options.ownerToken)}`
  const ownerDirectoryPath = join(outputDir, ownerDirectoryName)
  let directoryCreated = false
  try {
    await fileSystem.makeDirectory(ownerDirectoryPath, false)
    directoryCreated = true
    await fileSystem.writeExclusive(
      join(ownerDirectoryPath, LEASE_FILE_NAME),
      `${JSON.stringify(leaseForOwner(options, ownerDirectoryName))}\n`
    )
    await fileSystem.writeExclusive(
      join(ownerDirectoryPath, HEARTBEAT_FILE_NAME),
      `${JSON.stringify(heartbeatForOwner(options))}\n`
    )
    return {
      lockPath,
      ownerToken: options.ownerToken,
      ownerDirectoryPath,
      ownerDirectoryName,
      releasePath: join(
        outputDir,
        `${LOCK_RELEASE_PREFIX}${ownerFingerprint(options.ownerToken)}`
      )
    }
  } catch {
    if (directoryCreated) {
      await Promise.allSettled([fileSystem.remove(ownerDirectoryPath)])
    }
    throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
  }
}

function lockSnapshotExpired(
  snapshot: LockSnapshot,
  options: PublicationLockOptions
): boolean {
  const heartbeatRenewedAt = snapshot.heartbeat
    && snapshot.lease
    && snapshot.heartbeat.ownerToken === snapshot.lease.ownerToken
    ? snapshot.heartbeat.renewedAtEpochMs
    : undefined
  const renewedAt = heartbeatRenewedAt
    ?? snapshot.lease?.acquiredAtEpochMs
    ?? snapshot.modifiedAtEpochMs
  const age = options.now() - renewedAt
  return Number.isFinite(age) && age >= options.leaseDurationMs
}

function ownerCanBeRecovered(
  snapshot: LockSnapshot,
  options: PublicationLockOptions,
  ownerPrefix: string
): snapshot is LockSnapshot & { lease: EvaluationLockLease } {
  // Expiry is diagnostic only: shared finals remain safe because recovery also requires
  // authoritative proof that the former process cannot resume after an ownership check.
  if (!snapshot.lease
    || !safeOwnerArtifactName(snapshot, ownerPrefix)
    || !lockSnapshotExpired(snapshot, options)) return false
  try {
    return options.ownerDefinitelyGone(snapshot.lease)
  } catch {
    return false
  }
}

async function installPreparedCandidate(
  fileSystem: EvaluationPublisherFileSystem,
  ownership: PublicationLockOwnership
): Promise<void> {
  await fileSystem.createSymlink(ownership.ownerDirectoryName, ownership.lockPath)
}

async function recoverySentinelExists(
  fileSystem: EvaluationPublisherFileSystem,
  sentinelPath: string
): Promise<boolean> {
  return (await readOptionalMetadata(fileSystem, sentinelPath)) !== null
}

async function recoverDeadRecoverySentinel(
  fileSystem: EvaluationPublisherFileSystem,
  outputDir: string,
  sentinelPath: string,
  options: PublicationLockOptions
): Promise<boolean> {
  const snapshot = await readLockSnapshot(fileSystem, sentinelPath)
  if (!snapshot) return true
  if (!ownerCanBeRecovered(snapshot, options, LOCK_RECOVERY_OWNER_PREFIX)) return false
  const ownerDirectoryName = safeOwnerArtifactName(snapshot, LOCK_RECOVERY_OWNER_PREFIX)!
  const ownerDirectoryPath = join(outputDir, ownerDirectoryName)
  const detachedPath = join(
    outputDir,
    `${LOCK_RECOVERY_RELEASE_PREFIX}${ownerFingerprint(snapshot.lease.ownerToken)}`
  )
  try {
    const detached = await detachControlledSymlinkNoReplace(
      fileSystem,
      sentinelPath,
      detachedPath,
      current => sameLockSnapshot(current, snapshot),
      'lakebase_evaluation_publish_failed'
    )
    if (!detached) return false
    if (!(await unlinkExactLockSnapshot(fileSystem, detachedPath, detached))) {
      await restoreDetachedLinkIfVacant(fileSystem, sentinelPath, detachedPath, detached)
      return false
    }
    await fileSystem.remove(ownerDirectoryPath)
    return true
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'EEXIST')) return false
    if (error instanceof LakebaseEvaluationPublishError) throw error
    throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
  }
}

async function prepareRecoverySentinel(
  fileSystem: EvaluationPublisherFileSystem,
  outputDir: string,
  options: PublicationLockOptions
): Promise<LockRecoveryOwnership | null> {
  const ownerDirectoryName = `${LOCK_RECOVERY_OWNER_PREFIX}${ownerFingerprint(options.ownerToken)}`
  const ownerDirectoryPath = join(outputDir, ownerDirectoryName)
  const sentinelPath = join(outputDir, LOCK_RECOVERY_SENTINEL_NAME)
  let directoryCreated = false
  try {
    await fileSystem.makeDirectory(ownerDirectoryPath, false)
    directoryCreated = true
    await fileSystem.writeExclusive(
      join(ownerDirectoryPath, LEASE_FILE_NAME),
      `${JSON.stringify(leaseForOwner(options, ownerDirectoryName))}\n`
    )
    await fileSystem.writeExclusive(
      join(ownerDirectoryPath, HEARTBEAT_FILE_NAME),
      `${JSON.stringify(heartbeatForOwner(options))}\n`
    )
    await fileSystem.createSymlink(ownerDirectoryName, sentinelPath)
  } catch (error) {
    if (directoryCreated) {
      await Promise.allSettled([fileSystem.remove(ownerDirectoryPath)])
    }
    if (hasErrorCode(error, 'EEXIST')) return null
    throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
  }
  return {
    sentinelPath,
    ownerToken: options.ownerToken,
    ownerDirectoryPath,
    ownerDirectoryName,
    staleLockPath: join(
      outputDir,
      `${LOCK_STALE_PREFIX}${ownerFingerprint(options.ownerToken)}`
    ),
    releaseSentinelPath: join(
      outputDir,
      `${LOCK_RECOVERY_RELEASE_PREFIX}${ownerFingerprint(options.ownerToken)}`
    )
  }
}

async function assertRecoveryOwnership(
  fileSystem: EvaluationPublisherFileSystem,
  recovery: LockRecoveryOwnership
): Promise<void> {
  const snapshot = await readLockSnapshot(fileSystem, recovery.sentinelPath)
  if (!snapshotOwnedBy(
    snapshot,
    recovery.ownerToken,
    recovery.ownerDirectoryName,
    LOCK_RECOVERY_OWNER_PREFIX
  )) throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_lock_lost')
}

async function detachOwnedCanonical(
  fileSystem: EvaluationPublisherFileSystem,
  canonicalPath: string,
  detachedPath: string,
  ownerToken: string,
  ownerDirectoryName: string,
  ownerPrefix: string,
  failureCode: 'lakebase_evaluation_publish_lock_lost'
    | 'lakebase_evaluation_publish_lock_release_failed'
): Promise<void> {
  try {
    const detached = await detachControlledSymlinkNoReplace(
      fileSystem,
      canonicalPath,
      detachedPath,
      snapshot => snapshotOwnedBy(snapshot, ownerToken, ownerDirectoryName, ownerPrefix),
      failureCode
    )
    if (!detached) throw new LakebaseEvaluationPublishError(failureCode)
    const current = await readLockSnapshot(fileSystem, detachedPath)
    if (!current
      || !sameLockSnapshot(current, detached)
      || !snapshotOwnedBy(current, ownerToken, ownerDirectoryName, ownerPrefix)) {
      await restoreDetachedLinkIfVacant(
        fileSystem,
        canonicalPath,
        detachedPath,
        detached
      )
      throw new LakebaseEvaluationPublishError(failureCode)
    }
    if (!(await unlinkExactLockSnapshot(fileSystem, detachedPath, detached))) {
      await restoreDetachedLinkIfVacant(
        fileSystem,
        canonicalPath,
        detachedPath,
        detached
      )
      throw new LakebaseEvaluationPublishError(failureCode)
    }
  } catch (error) {
    if (error instanceof LakebaseEvaluationPublishError) throw error
    throw new LakebaseEvaluationPublishError(failureCode)
  }
}

async function clearRecoverySentinel(
  fileSystem: EvaluationPublisherFileSystem,
  recovery: LockRecoveryOwnership
): Promise<void> {
  await detachOwnedCanonical(
    fileSystem,
    recovery.sentinelPath,
    recovery.releaseSentinelPath,
    recovery.ownerToken,
    recovery.ownerDirectoryName,
    LOCK_RECOVERY_OWNER_PREFIX,
    'lakebase_evaluation_publish_lock_lost'
  )
  await fileSystem.remove(recovery.ownerDirectoryPath)
}

function sameLockSnapshot(left: LockSnapshot, right: LockSnapshot): boolean {
  return sameLockArtifact(left, right)
    && sameLockLinkIdentity(left, right)
}

function sameLockLinkIdentity(left: LockSnapshot, right: LockSnapshot): boolean {
  return left.linkTarget === right.linkTarget
    && left.modifiedAtEpochMs === right.modifiedAtEpochMs
    && left.device === right.device
    && left.inode === right.inode
}

function sameLockArtifact(left: LockSnapshot, right: LockSnapshot): boolean {
  return left.leaseRaw === right.leaseRaw
    && left.heartbeatRaw === right.heartbeatRaw
    && left.linkTarget === right.linkTarget
}

type LockDetachmentFailureCode
  = | 'lakebase_evaluation_publish_failed'
    | 'lakebase_evaluation_publish_lock_unavailable'
    | 'lakebase_evaluation_publish_lock_lost'
    | 'lakebase_evaluation_publish_lock_release_failed'

async function unlinkExactLockSnapshot(
  fileSystem: EvaluationPublisherFileSystem,
  path: string,
  expected: LockSnapshot
): Promise<boolean> {
  const current = await readLockSnapshot(fileSystem, path)
  if (!current || !sameLockLinkIdentity(current, expected)) return false
  try {
    await fileSystem.unlink(path)
    return true
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return true
    const afterFailure = await readLockSnapshot(fileSystem, path)
    if (!afterFailure) return true
    throw error
  }
}

async function rollbackCreatedDetachment(
  fileSystem: EvaluationPublisherFileSystem,
  sourcePath: string,
  detachedPath: string,
  source: LockSnapshot,
  detached: LockSnapshot
): Promise<boolean> {
  if (!source.linkTarget) return false
  let currentSource = await readLockSnapshot(fileSystem, sourcePath)
  if (!currentSource) {
    try {
      await fileSystem.createSymlink(source.linkTarget, sourcePath)
    } catch (error) {
      if (!hasErrorCode(error, 'EEXIST')) return false
    }
    currentSource = await readLockSnapshot(fileSystem, sourcePath)
  }
  if (!currentSource || currentSource.linkTarget !== source.linkTarget) return false
  return unlinkExactLockSnapshot(fileSystem, detachedPath, detached)
}

async function detachControlledSymlinkNoReplace(
  fileSystem: EvaluationPublisherFileSystem,
  sourcePath: string,
  detachedPath: string,
  sourceMatches: (snapshot: LockSnapshot) => boolean,
  failureCode: LockDetachmentFailureCode
): Promise<LockSnapshot | null> {
  let source: LockSnapshot | null
  try {
    source = await readLockSnapshot(fileSystem, sourcePath)
  } catch {
    throw new LakebaseEvaluationPublishError(failureCode)
  }
  if (!source?.linkTarget || !sourceMatches(source)) {
    throw new LakebaseEvaluationPublishError(failureCode)
  }

  try {
    await fileSystem.createSymlink(source.linkTarget, detachedPath)
  } catch (error) {
    if (hasErrorCode(error, 'EEXIST')) return null
    throw new LakebaseEvaluationPublishError(failureCode)
  }

  let detached: LockSnapshot | null
  try {
    detached = await readLockSnapshot(fileSystem, detachedPath)
  } catch {
    throw new LakebaseEvaluationPublishError(failureCode)
  }
  if (!detached || !sameLockArtifact(detached, source)) {
    if (detached) {
      await Promise.allSettled([
        rollbackCreatedDetachment(fileSystem, sourcePath, detachedPath, source, detached)
      ])
    }
    throw new LakebaseEvaluationPublishError(failureCode)
  }

  let revalidatedSource: LockSnapshot | null
  try {
    revalidatedSource = await readLockSnapshot(fileSystem, sourcePath)
  } catch {
    await Promise.allSettled([
      rollbackCreatedDetachment(fileSystem, sourcePath, detachedPath, source, detached)
    ])
    throw new LakebaseEvaluationPublishError(failureCode)
  }
  if (!revalidatedSource || !sameLockSnapshot(revalidatedSource, source)) {
    await Promise.allSettled([
      rollbackCreatedDetachment(fileSystem, sourcePath, detachedPath, source, detached)
    ])
    throw new LakebaseEvaluationPublishError(failureCode)
  }

  try {
    await fileSystem.unlink(sourcePath)
  } catch {
    const sourceAfterFailure = await readLockSnapshot(fileSystem, sourcePath)
    if (sourceAfterFailure) {
      await Promise.allSettled([
        rollbackCreatedDetachment(fileSystem, sourcePath, detachedPath, source, detached)
      ])
      throw new LakebaseEvaluationPublishError(failureCode)
    }
  }

  const detachedAfterUnlink = await readLockSnapshot(fileSystem, detachedPath)
  if (!detachedAfterUnlink || !sameLockSnapshot(detachedAfterUnlink, detached)) {
    await Promise.allSettled([
      rollbackCreatedDetachment(fileSystem, sourcePath, detachedPath, source, detached)
    ])
    throw new LakebaseEvaluationPublishError(failureCode)
  }
  return detached
}

async function restoreDetachedLinkIfVacant(
  fileSystem: EvaluationPublisherFileSystem,
  canonicalPath: string,
  detachedPath: string,
  detached: LockSnapshot
): Promise<boolean> {
  if (!detached.linkTarget) return false
  const currentDetached = await readLockSnapshot(fileSystem, detachedPath)
  if (!currentDetached || !sameLockLinkIdentity(currentDetached, detached)) return false
  try {
    await fileSystem.createSymlink(detached.linkTarget, canonicalPath)
  } catch (error) {
    if (hasErrorCode(error, 'EEXIST')) return false
    throw error
  }
  const restored = await readLockSnapshot(fileSystem, canonicalPath)
  if (!restored || restored.linkTarget !== detached.linkTarget) return false
  return unlinkExactLockSnapshot(fileSystem, detachedPath, detached)
}

async function releaseCandidateCanonicalOnly(
  fileSystem: EvaluationPublisherFileSystem,
  ownership: PublicationLockOwnership
): Promise<void> {
  await detachOwnedCanonical(
    fileSystem,
    ownership.lockPath,
    ownership.releasePath,
    ownership.ownerToken,
    ownership.ownerDirectoryName,
    LOCK_OWNER_DIRECTORY_PREFIX,
    'lakebase_evaluation_publish_lock_lost'
  )
}

async function waitForCanonicalAbsence(
  fileSystem: EvaluationPublisherFileSystem,
  lockPath: string,
  sleep: (milliseconds: number) => Promise<void>
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_LOCK_ATTEMPTS; attempt += 1) {
    if (!(await readOptionalMetadata(fileSystem, lockPath))) return
    if (attempt === MAX_LOCK_ATTEMPTS) {
      throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_lock_unavailable')
    }
    await sleep(LOCK_RETRY_MILLISECONDS)
  }
}

async function rollbackFailedStaleRecovery(
  fileSystem: EvaluationPublisherFileSystem,
  outputDir: string,
  ownership: PublicationLockOwnership,
  recovery: LockRecoveryOwnership,
  staleSnapshot: LockSnapshot,
  quarantinedSnapshot: LockSnapshot | null
): Promise<void> {
  const canonical = await readLockSnapshot(fileSystem, ownership.lockPath)
  if (snapshotOwnedBy(
    canonical,
    ownership.ownerToken,
    ownership.ownerDirectoryName,
    LOCK_OWNER_DIRECTORY_PREFIX
  )) {
    await releaseCandidateCanonicalOnly(fileSystem, ownership)
  }

  const quarantined = quarantinedSnapshot
    ? await readLockSnapshot(fileSystem, recovery.staleLockPath)
    : null
  if (quarantined
    && quarantinedSnapshot
    && sameLockSnapshot(quarantined, quarantinedSnapshot)) {
    const occupyingCanonical = await readLockSnapshot(fileSystem, ownership.lockPath)
    if (occupyingCanonical) {
      const staleOwnerDirectoryName = safeOwnerArtifactName(
        staleSnapshot,
        LOCK_OWNER_DIRECTORY_PREFIX
      )
      const occupyingOwnerDirectoryName = safeOwnerArtifactName(
        occupyingCanonical,
        LOCK_OWNER_DIRECTORY_PREFIX
      )
      if (sameLockArtifact(quarantined, staleSnapshot)
        && occupyingOwnerDirectoryName
        && occupyingOwnerDirectoryName !== staleOwnerDirectoryName
        && staleOwnerDirectoryName
        && await unlinkExactLockSnapshot(
          fileSystem,
          recovery.staleLockPath,
          quarantinedSnapshot
        )) {
        await fileSystem.remove(join(outputDir, staleOwnerDirectoryName))
      }
    } else {
      await restoreDetachedLinkIfVacant(
        fileSystem,
        ownership.lockPath,
        recovery.staleLockPath,
        quarantinedSnapshot
      )
    }
  }
  if (await recoverySentinelExists(fileSystem, recovery.sentinelPath)) {
    await assertRecoveryOwnership(fileSystem, recovery)
    await clearRecoverySentinel(fileSystem, recovery)
  } else {
    await fileSystem.remove(recovery.ownerDirectoryPath)
  }
}

async function recoverStaleLock(
  fileSystem: EvaluationPublisherFileSystem,
  outputDir: string,
  ownership: PublicationLockOwnership,
  snapshot: LockSnapshot,
  sleep: (milliseconds: number) => Promise<void>,
  options: PublicationLockOptions
): Promise<PublicationLockOwnership | null> {
  const recovery = await prepareRecoverySentinel(fileSystem, outputDir, options)
  if (!recovery) return null
  let quarantinedSnapshot: LockSnapshot | null = null

  try {
    await assertRecoveryOwnership(fileSystem, recovery)
    const current = await readLockSnapshot(fileSystem, ownership.lockPath)
    if (!current || !sameLockSnapshot(current, snapshot)) {
      await clearRecoverySentinel(fileSystem, recovery)
      return null
    }

    await assertRecoveryOwnership(fileSystem, recovery)
    quarantinedSnapshot = await detachControlledSymlinkNoReplace(
      fileSystem,
      ownership.lockPath,
      recovery.staleLockPath,
      inspected => sameLockSnapshot(inspected, snapshot),
      'lakebase_evaluation_publish_lock_unavailable'
    )
    if (!quarantinedSnapshot) {
      await clearRecoverySentinel(fileSystem, recovery)
      throw new LakebaseEvaluationPublishError(
        'lakebase_evaluation_publish_lock_unavailable'
      )
    }
    const quarantined = await readLockSnapshot(fileSystem, recovery.staleLockPath)
    if (!quarantined
      || !sameLockSnapshot(quarantined, quarantinedSnapshot)
      || !sameLockArtifact(quarantined, snapshot)) {
      await assertRecoveryOwnership(fileSystem, recovery)
      await waitForCanonicalAbsence(fileSystem, ownership.lockPath, sleep)
      await assertRecoveryOwnership(fileSystem, recovery)
      if (!(await restoreDetachedLinkIfVacant(
        fileSystem,
        ownership.lockPath,
        recovery.staleLockPath,
        quarantinedSnapshot
      ))) {
        throw new LakebaseEvaluationPublishError(
          'lakebase_evaluation_publish_lock_unavailable'
        )
      }
      await clearRecoverySentinel(fileSystem, recovery)
      return null
    }

    for (let attempt = 1; attempt <= MAX_LOCK_ATTEMPTS; attempt += 1) {
      await assertRecoveryOwnership(fileSystem, recovery)
      try {
        await installPreparedCandidate(fileSystem, ownership)
        break
      } catch (error) {
        if (!hasErrorCode(error, 'EEXIST')) {
          throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
        }
        if (attempt === MAX_LOCK_ATTEMPTS) {
          throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_lock_unavailable')
        }
        await sleep(LOCK_RETRY_MILLISECONDS)
      }
    }

    await assertRecoveryOwnership(fileSystem, recovery)
    await clearRecoverySentinel(fileSystem, recovery)
    await assertLockOwnership(fileSystem, ownership)
    if (!(await unlinkExactLockSnapshot(
      fileSystem,
      recovery.staleLockPath,
      quarantinedSnapshot
    ))) {
      throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_lock_lost')
    }
    const staleOwnerDirectoryName = safeOwnerArtifactName(
      snapshot,
      LOCK_OWNER_DIRECTORY_PREFIX
    )
    if (staleOwnerDirectoryName) {
      await assertLockOwnership(fileSystem, ownership)
      await fileSystem.remove(join(outputDir, staleOwnerDirectoryName))
    }
    return ownership
  } catch (error) {
    await Promise.allSettled([
      rollbackFailedStaleRecovery(
        fileSystem,
        outputDir,
        ownership,
        recovery,
        snapshot,
        quarantinedSnapshot
      )
    ])
    throw error
  }
}

async function acquirePublicationLock(
  fileSystem: EvaluationPublisherFileSystem,
  outputDir: string,
  lockPath: string,
  sleep: (milliseconds: number) => Promise<void>,
  options: PublicationLockOptions
): Promise<PublicationLockOwnership> {
  const candidate = await prepareLockCandidate(fileSystem, outputDir, lockPath, options)
  const recoverySentinelPath = join(outputDir, LOCK_RECOVERY_SENTINEL_NAME)
  let installed = false
  try {
    for (let attempt = 1; attempt <= MAX_LOCK_ATTEMPTS; attempt += 1) {
      if (await recoverySentinelExists(fileSystem, recoverySentinelPath)) {
        if (await recoverDeadRecoverySentinel(
          fileSystem,
          outputDir,
          recoverySentinelPath,
          options
        )) continue
        if (attempt === MAX_LOCK_ATTEMPTS) {
          throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_lock_unavailable')
        }
        await sleep(LOCK_RETRY_MILLISECONDS)
        continue
      }
      try {
        await installPreparedCandidate(fileSystem, candidate)
        installed = true
        if (await recoverySentinelExists(fileSystem, recoverySentinelPath)) {
          await releaseCandidateCanonicalOnly(fileSystem, candidate)
          installed = false
          if (attempt === MAX_LOCK_ATTEMPTS) {
            throw new LakebaseEvaluationPublishError(
              'lakebase_evaluation_publish_lock_unavailable'
            )
          }
          await sleep(LOCK_RETRY_MILLISECONDS)
          continue
        }
        return candidate
      } catch (error) {
        if (!hasErrorCode(error, 'EEXIST')) {
          if (error instanceof LakebaseEvaluationPublishError) throw error
          throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
        }
        const snapshot = await readLockSnapshot(fileSystem, lockPath)
        if (snapshot && ownerCanBeRecovered(
          snapshot,
          options,
          LOCK_OWNER_DIRECTORY_PREFIX
        )) {
          const ownership = await recoverStaleLock(
            fileSystem,
            outputDir,
            candidate,
            snapshot,
            sleep,
            options
          )
          if (ownership) {
            installed = true
            return ownership
          }
        }
        if (attempt === MAX_LOCK_ATTEMPTS) {
          throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_lock_unavailable')
        }
        await sleep(LOCK_RETRY_MILLISECONDS)
      }
    }
  } catch (error) {
    if (!installed) {
      let candidateStillCanonical = true
      try {
        candidateStillCanonical = snapshotOwnedBy(
          await readLockSnapshot(fileSystem, candidate.lockPath),
          candidate.ownerToken,
          candidate.ownerDirectoryName,
          LOCK_OWNER_DIRECTORY_PREFIX
        )
      } catch {
        // Ambiguous canonical identity must retain the candidate evidence fail closed.
      }
      if (!candidateStillCanonical) {
        await Promise.allSettled([fileSystem.remove(candidate.ownerDirectoryPath)])
      }
    }
    throw error
  }
  throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_lock_unavailable')
}

async function assertLockOwnership(
  fileSystem: EvaluationPublisherFileSystem,
  ownership: PublicationLockOwnership
): Promise<void> {
  const snapshot = await readLockSnapshot(fileSystem, ownership.lockPath)
  if (!snapshotOwnedBy(
    snapshot,
    ownership.ownerToken,
    ownership.ownerDirectoryName,
    LOCK_OWNER_DIRECTORY_PREFIX
  )) {
    throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_lock_lost')
  }
}

interface PublicationHeartbeat {
  assertHealthy: () => void
  stop: () => Promise<void>
}

function startPublicationHeartbeat(
  fileSystem: EvaluationPublisherFileSystem,
  ownership: PublicationLockOwnership,
  options: PublicationLockOptions
): PublicationHeartbeat {
  let stopped = false
  let failure: LakebaseEvaluationPublishError | undefined
  let pending = Promise.resolve()

  const renew = async () => {
    const temporaryPath = join(
      ownership.ownerDirectoryPath,
      `.heartbeat.${randomUUID()}.tmp`
    )
    try {
      await assertLockOwnership(fileSystem, ownership)
      await fileSystem.writeExclusive(
        temporaryPath,
        `${JSON.stringify(heartbeatForOwner(options))}\n`
      )
      await assertLockOwnership(fileSystem, ownership)
      await fileSystem.rename(
        temporaryPath,
        join(ownership.ownerDirectoryPath, HEARTBEAT_FILE_NAME)
      )
    } catch {
      await Promise.allSettled([fileSystem.remove(temporaryPath)])
      throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_lock_lost')
    }
  }

  const timer = setInterval(() => {
    pending = pending.then(async () => {
      if (!stopped && !failure) await renew()
    }).catch(() => {
      failure = new LakebaseEvaluationPublishError('lakebase_evaluation_publish_lock_lost')
      clearInterval(timer)
    })
  }, options.heartbeatIntervalMs)
  timer.unref()

  return {
    assertHealthy() {
      if (failure) throw failure
    },
    async stop() {
      stopped = true
      clearInterval(timer)
      await pending
      if (failure) throw failure
    }
  }
}

async function mutateWhileOwned<T>(
  fileSystem: EvaluationPublisherFileSystem,
  ownership: PublicationLockOwnership,
  heartbeat: PublicationHeartbeat,
  mutation: () => Promise<T>
): Promise<T> {
  heartbeat.assertHealthy()
  await assertLockOwnership(fileSystem, ownership)
  return mutation()
}

async function moveIfPresent(
  fileSystem: EvaluationPublisherFileSystem,
  from: string,
  to: string
): Promise<boolean> {
  try {
    await fileSystem.rename(from, to)
    return true
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return false
    throw error
  }
}

async function cleanupPublicationPaths(
  fileSystem: EvaluationPublisherFileSystem,
  paths: readonly string[],
  ownership: PublicationLockOwnership,
  heartbeat: PublicationHeartbeat
): Promise<boolean> {
  let cleaned = true
  for (const path of paths) {
    try {
      await mutateWhileOwned(
        fileSystem,
        ownership,
        heartbeat,
        () => fileSystem.remove(path)
      )
    } catch (error) {
      if (error instanceof LakebaseEvaluationPublishError
        && error.code === 'lakebase_evaluation_publish_lock_lost') throw error
      cleaned = false
    }
  }
  return cleaned
}

async function recoveryMarkerExists(
  fileSystem: EvaluationPublisherFileSystem,
  markerPath: string
): Promise<boolean> {
  try {
    await fileSystem.readText(markerPath)
    return true
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return false
    throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
  }
}

async function unresolvedPublicationRecoveryExists(
  fileSystem: EvaluationPublisherFileSystem,
  outputDir: string
): Promise<boolean> {
  try {
    return (await fileSystem.listDirectory(outputDir)).some(name => (
      name.startsWith(PUBLICATION_RECOVERY_DIRECTORY_PREFIX)
    ))
  } catch {
    throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
  }
}

async function preserveRecoveryMarker(
  fileSystem: EvaluationPublisherFileSystem,
  markerPath: string
): Promise<boolean> {
  try {
    await fileSystem.writeExclusive(
      markerPath,
      `${JSON.stringify({ schemaVersion: 1, status: 'recovery_required' })}\n`
    )
    return true
  } catch (error) {
    return hasErrorCode(error, 'EEXIST')
  }
}

function stablePublishError(error: unknown): LakebaseEvaluationPublishError {
  return error instanceof LakebaseEvaluationPublishError
    ? error
    : new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
}

function attachPublishFailure(
  primary: LakebaseEvaluationPublishError,
  property: 'lockReleaseFailure' | 'cleanupFailure',
  failure: LakebaseEvaluationPublishError
): void {
  Object.defineProperty(primary, property, {
    value: failure,
    configurable: true
  })
}

async function releasePublicationLock(
  fileSystem: EvaluationPublisherFileSystem,
  ownership: PublicationLockOwnership
): Promise<void> {
  try {
    await detachOwnedCanonical(
      fileSystem,
      ownership.lockPath,
      ownership.releasePath,
      ownership.ownerToken,
      ownership.ownerDirectoryName,
      LOCK_OWNER_DIRECTORY_PREFIX,
      'lakebase_evaluation_publish_lock_release_failed'
    )
    await fileSystem.remove(ownership.ownerDirectoryPath)
  } catch {
    throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_lock_release_failed')
  }
}

async function restorePriorPublication(
  fileSystem: EvaluationPublisherFileSystem,
  paths: EvaluationReportPaths,
  backups: EvaluationReportPaths,
  prior: { json: boolean, markdown: boolean },
  ownership: PublicationLockOwnership,
  heartbeat: PublicationHeartbeat
): Promise<boolean> {
  let restored = true
  const attempt = async (mutation: () => Promise<void>) => {
    try {
      await mutateWhileOwned(fileSystem, ownership, heartbeat, mutation)
    } catch (error) {
      if (error instanceof LakebaseEvaluationPublishError
        && error.code === 'lakebase_evaluation_publish_lock_lost') throw error
      restored = false
    }
  }
  await attempt(() => fileSystem.remove(paths.json))
  await attempt(() => fileSystem.remove(paths.markdown))
  if (prior.json) await attempt(() => fileSystem.rename(backups.json, paths.json))
  if (prior.markdown) await attempt(() => fileSystem.rename(backups.markdown, paths.markdown))
  return restored
}

export async function publishEvaluationReports(
  outputDir: string,
  payload: EvaluationReportPayload,
  deps: EvaluationPublisherDependencies = {}
): Promise<EvaluationReportPaths> {
  const fileSystem = deps.fileSystem || defaultPublisherFileSystem
  const sleep = deps.sleep || delay
  const leaseDurationMs = Math.max(
    1,
    deps.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MILLISECONDS
  )
  const maximumHeartbeatIntervalMs = Math.max(1, Math.floor(leaseDurationMs / 3))
  const lockOptions: PublicationLockOptions = {
    now: deps.now || (() => Date.now()),
    ownerToken: (deps.ownerToken || (() => randomUUID()))(),
    leaseDurationMs,
    ownerDefinitelyGone: deps.ownerDefinitelyGone || ownerProcessDefinitelyGone,
    heartbeatIntervalMs: Math.min(
      Math.max(1, deps.heartbeatIntervalMs ?? maximumHeartbeatIntervalMs),
      maximumHeartbeatIntervalMs
    )
  }
  try {
    await fileSystem.makeDirectory(outputDir, true)
  } catch {
    throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
  }

  const paths = {
    json: join(outputDir, 'evaluation.json'),
    markdown: join(outputDir, 'evaluation.md')
  }
  const lockPath = join(outputDir, LOCK_DIRECTORY_NAME)
  const recoveryMarkerPath = join(outputDir, RECOVERY_MARKER_NAME)
  const nonce = `${process.pid}-${randomUUID()}`
  const temporaryPaths = {
    json: join(outputDir, `.evaluation.json.${nonce}.tmp`),
    markdown: join(outputDir, `.evaluation.md.${nonce}.tmp`)
  }
  const publicationRecoveryDirectory = join(
    outputDir,
    `${PUBLICATION_RECOVERY_DIRECTORY_PREFIX}${nonce}`
  )
  const backupPaths = {
    json: join(publicationRecoveryDirectory, `.evaluation.json.${nonce}.backup`),
    markdown: join(publicationRecoveryDirectory, `.evaluation.md.${nonce}.backup`)
  }
  const publicationRecoveryStatePath = join(
    publicationRecoveryDirectory,
    PUBLICATION_RECOVERY_STATE_NAME
  )
  const publicationRecoveryMarkerPath = join(
    publicationRecoveryDirectory,
    PUBLICATION_RECOVERY_MARKER_NAME
  )
  const prior = { json: false, markdown: false }
  let ownership: PublicationLockOwnership | undefined
  let heartbeat: PublicationHeartbeat | undefined
  let publicationStarted = false
  let publicationRecoveryStarted = false
  let preserveBackups = false
  let primaryError: LakebaseEvaluationPublishError | undefined
  let publishedPaths: EvaluationReportPaths | undefined

  try {
    ownership = await acquirePublicationLock(fileSystem, outputDir, lockPath, sleep, lockOptions)
    heartbeat = startPublicationHeartbeat(fileSystem, ownership, lockOptions)
    if (await recoveryMarkerExists(fileSystem, recoveryMarkerPath)
      || await unresolvedPublicationRecoveryExists(fileSystem, outputDir)) {
      throw new LakebaseEvaluationPublishError('lakebase_evaluation_recovery_required')
    }

    const writes = await Promise.allSettled([
      mutateWhileOwned(
        fileSystem,
        ownership,
        heartbeat,
        () => fileSystem.writeExclusive(temporaryPaths.json, payload.json)
      ),
      mutateWhileOwned(
        fileSystem,
        ownership,
        heartbeat,
        () => fileSystem.writeExclusive(temporaryPaths.markdown, payload.markdown)
      )
    ])
    if (writes.some(result => result.status === 'rejected')) {
      throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
    }

    await mutateWhileOwned(
      fileSystem,
      ownership,
      heartbeat,
      () => fileSystem.makeDirectory(publicationRecoveryDirectory, false)
    )
    publicationRecoveryStarted = true
    await mutateWhileOwned(
      fileSystem,
      ownership,
      heartbeat,
      () => fileSystem.writeExclusive(
        publicationRecoveryStatePath,
        `${JSON.stringify({ schemaVersion: 1, status: 'publishing' })}\n`
      )
    )
    prior.json = await mutateWhileOwned(
      fileSystem,
      ownership,
      heartbeat,
      () => moveIfPresent(fileSystem, paths.json, backupPaths.json)
    )
    try {
      prior.markdown = await mutateWhileOwned(
        fileSystem,
        ownership,
        heartbeat,
        () => moveIfPresent(fileSystem, paths.markdown, backupPaths.markdown)
      )
    } catch (error) {
      if (prior.json) {
        try {
          await mutateWhileOwned(
            fileSystem,
            ownership,
            heartbeat,
            () => fileSystem.rename(backupPaths.json, paths.json)
          )
        } catch {
          throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_rollback_failed')
        }
      }
      throw error
    }
    publicationStarted = true
    await mutateWhileOwned(
      fileSystem,
      ownership,
      heartbeat,
      () => fileSystem.rename(temporaryPaths.json, paths.json)
    )
    await mutateWhileOwned(
      fileSystem,
      ownership,
      heartbeat,
      () => fileSystem.rename(temporaryPaths.markdown, paths.markdown)
    )
    publishedPaths = paths
  } catch (error) {
    primaryError = stablePublishError(error)
    if (primaryError.code === 'lakebase_evaluation_publish_rollback_failed') {
      preserveBackups = true
    }
    if (publicationStarted && ownership && heartbeat
      && primaryError.code !== 'lakebase_evaluation_publish_lock_lost') {
      let restored = false
      try {
        restored = await restorePriorPublication(
          fileSystem,
          paths,
          backupPaths,
          prior,
          ownership,
          heartbeat
        )
      } catch {
        primaryError = new LakebaseEvaluationPublishError('lakebase_evaluation_publish_lock_lost')
      }
      if (!restored) {
        preserveBackups = true
        if (primaryError.code !== 'lakebase_evaluation_publish_lock_lost') {
          primaryError = new LakebaseEvaluationPublishError(
            'lakebase_evaluation_publish_rollback_failed'
          )
        }
      }
    }
  }

  if (ownership && heartbeat) {
    const recordCleanupFailure = () => {
      preserveBackups = publicationRecoveryStarted
      const cleanupFailure = new LakebaseEvaluationPublishError(
        'lakebase_evaluation_publish_cleanup_failed'
      )
      if (primaryError) attachPublishFailure(primaryError, 'cleanupFailure', cleanupFailure)
      else primaryError = cleanupFailure
    }
    let temporaryFilesCleaned = false
    try {
      temporaryFilesCleaned = await cleanupPublicationPaths(
        fileSystem,
        [temporaryPaths.json, temporaryPaths.markdown],
        ownership,
        heartbeat
      )
    } catch (error) {
      preserveBackups = true
      primaryError = error instanceof LakebaseEvaluationPublishError
        && error.code === 'lakebase_evaluation_publish_lock_lost'
        ? error
        : new LakebaseEvaluationPublishError('lakebase_evaluation_publish_cleanup_failed')
    }
    if (!temporaryFilesCleaned
      && primaryError?.code !== 'lakebase_evaluation_publish_lock_lost') {
      recordCleanupFailure()
    }

    if (publicationRecoveryStarted && !preserveBackups) {
      let backupsCleaned = false
      try {
        backupsCleaned = await cleanupPublicationPaths(
          fileSystem,
          [backupPaths.json, backupPaths.markdown],
          ownership,
          heartbeat
        )
      } catch (error) {
        if (error instanceof LakebaseEvaluationPublishError
          && error.code === 'lakebase_evaluation_publish_lock_lost') {
          primaryError = error
          preserveBackups = true
        } else {
          recordCleanupFailure()
        }
      }
      if (!backupsCleaned
        && primaryError?.code !== 'lakebase_evaluation_publish_lock_lost') {
        recordCleanupFailure()
      }
    }

    if (publicationRecoveryStarted
      && preserveBackups
      && primaryError?.code !== 'lakebase_evaluation_publish_lock_lost') {
      let markerPreserved = false
      try {
        markerPreserved = await mutateWhileOwned(
          fileSystem,
          ownership,
          heartbeat,
          () => preserveRecoveryMarker(fileSystem, publicationRecoveryMarkerPath)
        )
      } catch (error) {
        if (error instanceof LakebaseEvaluationPublishError
          && error.code === 'lakebase_evaluation_publish_lock_lost') {
          primaryError = error
        } else {
          recordCleanupFailure()
        }
      }
      if (!markerPreserved) {
        recordCleanupFailure()
      }
    } else if (publicationRecoveryStarted
      && primaryError?.code !== 'lakebase_evaluation_publish_lock_lost') {
      try {
        await mutateWhileOwned(
          fileSystem,
          ownership,
          heartbeat,
          () => fileSystem.remove(publicationRecoveryDirectory)
        )
      } catch (error) {
        if (error instanceof LakebaseEvaluationPublishError
          && error.code === 'lakebase_evaluation_publish_lock_lost') {
          primaryError = error
        } else {
          recordCleanupFailure()
        }
      }
    }

    try {
      await heartbeat.stop()
    } catch {
      if (!primaryError) {
        primaryError = new LakebaseEvaluationPublishError('lakebase_evaluation_publish_lock_lost')
      }
    }

    try {
      await releasePublicationLock(fileSystem, ownership)
    } catch {
      const releaseFailure = new LakebaseEvaluationPublishError(
        'lakebase_evaluation_publish_lock_release_failed'
      )
      if (primaryError) attachPublishFailure(primaryError, 'lockReleaseFailure', releaseFailure)
      else primaryError = releaseFailure
    }
  }

  if (primaryError) throw primaryError
  if (!publishedPaths) throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
  return publishedPaths
}

export async function runLakebaseEvaluation(
  options: LakebaseEvaluateOptions,
  deps: LakebaseEvaluationDependencies = {}
): Promise<LakebaseEvaluationResult> {
  validateOptions(options)
  const target = (deps.resolveTarget || resolvePilotTarget)(deps.env || process.env, 'read')
  const database = await (deps.createDatabase || createPilotDatabase)(target)
  let operationCompleted = false
  let primaryError: unknown
  let fixture: LakebasePilotFixture
  const legacy = newEngineEvaluation()
  const bm25 = newEngineEvaluation()

  try {
    fixture = deps.fixture || await (deps.loadFixture || readDefaultFixture)()
    const documentsById = new Map(fixture.documents.map(document => [document.id, document]))
    const searchLegacy = deps.searchLegacy || searchLegacyPilot
    const searchBm25 = deps.searchBm25 || searchBm25Pilot
    const nowMs = deps.nowMs || (() => performance.now())

    for (const query of fixture.queries) {
      const legacyHits = await executeSearch(
        legacy, searchLegacy, database, query.clientId, query.query, documentsById
      )
      const bm25Hits = await executeSearch(
        bm25, searchBm25, database, query.clientId, query.query, documentsById
      )
      legacy.results.push({ queryId: query.id, resultIds: legacyHits.map(hit => hit.id) })
      bm25.results.push({ queryId: query.id, resultIds: bm25Hits.map(hit => hit.id) })

      for (let run = 0; run < options.runs; run += 1) {
        await recordLatencySearch(
          legacy, searchLegacy, database, query.clientId, query.query, documentsById, nowMs
        )
        await recordLatencySearch(
          bm25, searchBm25, database, query.clientId, query.query, documentsById, nowMs
        )
      }
    }
    operationCompleted = true
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    await closePilotDatabasePreservingError(database, { operationCompleted, primaryError })
  }

  const judgements: RetrievalJudgement[] = fixture.queries.map(query => ({
    queryId: query.id,
    relevantIds: new Set(query.relevantIds)
  }))
  const engines = {
    legacy: reportMetrics(legacy, judgements),
    bm25: reportMetrics(bm25, judgements)
  }
  const queries = judgements.map((judgement, index) => queryReport(
    judgement,
    legacy.results[index]?.resultIds || [],
    bm25.results[index]?.resultIds || []
  ))
  const overlap = {
    meanAt10: queries.reduce((total, query) => total + query.overlapAt10, 0) / queries.length,
    byQuery: queries.map(query => ({ queryId: query.queryId, overlapAt10: query.overlapAt10 }))
  }
  const gate = decideBm25Gate(engines)
  const report: LakebaseEvaluationReport = {
    schemaVersion: 1,
    generatedAt: (deps.now || (() => new Date()))().toISOString(),
    corpus: 'synthetic_crm_v1',
    identifiersEmitted: false,
    rawQueriesEmitted: false,
    cloudflareVectorizeChanged: false,
    productionDatabaseChanged: false,
    coldStartOperatorAsserted: options.coldStart,
    runs: options.runs,
    engines,
    overlap,
    queries,
    gate
  }
  const publishReports = deps.publishReports || ((outputDir, payload) => (
    publishEvaluationReports(outputDir, payload, deps.publisherDependencies)
  ))
  const paths = await publishReports(options.outputDir, {
    json: `${JSON.stringify(report, null, 2)}\n`,
    markdown: markdownReport(report)
  })
  return { exitCode: gate.passed ? 0 : 1, report, paths }
}

async function main(): Promise<void> {
  try {
    const options = parseEvaluateArgs(process.argv.slice(2))
    const result = await runLakebaseEvaluation(options)
    console.log(JSON.stringify({
      status: result.report.gate.status,
      reviewEligible: result.report.gate.passed,
      schemaVersion: result.report.schemaVersion
    }))
    process.exitCode = result.exitCode
  } catch {
    console.error(JSON.stringify({ status: 'blocked', code: 'evaluation_failed' }))
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
