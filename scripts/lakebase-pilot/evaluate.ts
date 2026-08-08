import { createHash, randomUUID } from 'node:crypto'
import {
  mkdir as fsMkdir,
  readFile,
  rename as fsRename,
  rm as fsRm,
  writeFile as fsWriteFile
} from 'node:fs/promises'
import { hostname as systemHostname } from 'node:os'
import { join } from 'node:path'
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
  readText: (path: string) => Promise<string>
  rename: (from: string, to: string) => Promise<void>
  remove: (path: string) => Promise<void>
}

export interface EvaluationLockLease {
  schemaVersion: 1
  ownerToken: string
  acquiredAtEpochMs: number
  processId: number
  hostname: string
}

export interface EvaluationPublisherDependencies {
  fileSystem?: EvaluationPublisherFileSystem
  sleep?: (milliseconds: number) => Promise<void>
  now?: () => number
  ownerToken?: () => string
  leaseDurationMs?: number
  isOwnerActive?: (lease: EvaluationLockLease) => Promise<boolean>
  recoverInvalidLease?: (rawLease: string | null) => Promise<boolean>
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
const RECOVERY_MARKER_NAME = '.evaluation.recovery.json'

const defaultPublisherFileSystem: EvaluationPublisherFileSystem = {
  async makeDirectory(path, recursive) {
    await fsMkdir(path, { recursive })
  },
  async writeExclusive(path, content) {
    await fsWriteFile(path, content, { flag: 'wx' })
  },
  readText: path => readFile(path, 'utf8'),
  async rename(from, to) {
    await fsRename(from, to)
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

async function readLockLease(
  fileSystem: EvaluationPublisherFileSystem,
  lockPath: string
): Promise<{ lease: EvaluationLockLease | null, raw: string | null }> {
  try {
    const raw = await fileSystem.readText(join(lockPath, LEASE_FILE_NAME))
    return { lease: parseLockLease(raw), raw }
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return { lease: null, raw: null }
    throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
  }
}

async function defaultIsOwnerActive(lease: EvaluationLockLease): Promise<boolean> {
  if (lease.hostname !== systemHostname()) return true
  try {
    process.kill(lease.processId, 0)
    return true
  } catch (error) {
    return !hasErrorCode(error, 'ESRCH')
  }
}

interface PublicationLockOptions {
  now: () => number
  ownerToken: string
  leaseDurationMs: number
  isOwnerActive: (lease: EvaluationLockLease) => Promise<boolean>
  recoverInvalidLease?: (rawLease: string | null) => Promise<boolean>
}

interface PublicationLockOwnership {
  lockPath: string
  ownerToken: string
  quarantinePath?: string
}

interface RecoverableLockSnapshot {
  rawLease: string | null
}

function staleLockQuarantinePath(
  lockPath: string,
  snapshot: RecoverableLockSnapshot
): string {
  const fingerprint = createHash('sha256')
    .update(snapshot.rawLease ?? '<missing-lease>')
    .digest('hex')
    .slice(0, 16)
  return `${lockPath}.stale.${fingerprint}`
}

function leaseForOwner(options: PublicationLockOptions): EvaluationLockLease {
  return {
    schemaVersion: 1,
    ownerToken: options.ownerToken,
    acquiredAtEpochMs: options.now(),
    processId: process.pid,
    hostname: systemHostname()
  }
}

async function createOwnedLock(
  fileSystem: EvaluationPublisherFileSystem,
  lockPath: string,
  options: PublicationLockOptions
): Promise<PublicationLockOwnership> {
  await fileSystem.makeDirectory(lockPath, false)
  try {
    await fileSystem.writeExclusive(
      join(lockPath, LEASE_FILE_NAME),
      `${JSON.stringify(leaseForOwner(options))}\n`
    )
    return { lockPath, ownerToken: options.ownerToken }
  } catch {
    await Promise.allSettled([fileSystem.remove(lockPath)])
    throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
  }
}

async function mayRecoverLock(
  fileSystem: EvaluationPublisherFileSystem,
  lockPath: string,
  options: PublicationLockOptions
): Promise<RecoverableLockSnapshot | null> {
  const inspected = await readLockLease(fileSystem, lockPath)
  if (!inspected.lease) {
    return (await options.recoverInvalidLease?.(inspected.raw))
      ? { rawLease: inspected.raw }
      : null
  }
  const age = options.now() - inspected.lease.acquiredAtEpochMs
  if (!Number.isFinite(age) || age < options.leaseDurationMs) return null
  return (await options.isOwnerActive(inspected.lease))
    ? null
    : { rawLease: inspected.raw }
}

async function quarantineAndReplaceStaleLock(
  fileSystem: EvaluationPublisherFileSystem,
  lockPath: string,
  options: PublicationLockOptions,
  snapshot: RecoverableLockSnapshot
): Promise<PublicationLockOwnership | null> {
  const quarantinePath = staleLockQuarantinePath(lockPath, snapshot)
  try {
    await fileSystem.rename(lockPath, quarantinePath)
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')
      || hasErrorCode(error, 'EEXIST')
      || hasErrorCode(error, 'ENOTEMPTY')) return null
    throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
  }

  const quarantined = await readLockLease(fileSystem, quarantinePath)
  if (quarantined.raw !== snapshot.rawLease) {
    try {
      await fileSystem.rename(quarantinePath, lockPath)
    } catch {
      throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
    }
    return null
  }

  try {
    return {
      ...await createOwnedLock(fileSystem, lockPath, options),
      quarantinePath
    }
  } catch (error) {
    if (hasErrorCode(error, 'EEXIST')) return null
    throw error
  }
}

async function acquirePublicationLock(
  fileSystem: EvaluationPublisherFileSystem,
  lockPath: string,
  sleep: (milliseconds: number) => Promise<void>,
  options: PublicationLockOptions
): Promise<PublicationLockOwnership> {
  for (let attempt = 1; attempt <= MAX_LOCK_ATTEMPTS; attempt += 1) {
    try {
      return await createOwnedLock(fileSystem, lockPath, options)
    } catch (error) {
      if (!hasErrorCode(error, 'EEXIST')) {
        if (error instanceof LakebaseEvaluationPublishError) throw error
        throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
      }
      const recoverable = await mayRecoverLock(fileSystem, lockPath, options)
      if (recoverable) {
        const ownership = await quarantineAndReplaceStaleLock(
          fileSystem,
          lockPath,
          options,
          recoverable
        )
        if (ownership) return ownership
      }
      if (attempt === MAX_LOCK_ATTEMPTS) {
        throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_lock_unavailable')
      }
      await sleep(LOCK_RETRY_MILLISECONDS)
    }
  }
  throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_lock_unavailable')
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
  paths: readonly string[]
): Promise<boolean> {
  const results = await Promise.allSettled(paths.map(path => fileSystem.remove(path)))
  return results.every(result => result.status === 'fulfilled')
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
    const inspected = await readLockLease(fileSystem, ownership.lockPath)
    if (!inspected.lease || inspected.lease.ownerToken !== ownership.ownerToken) {
      throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_lock_release_failed')
    }
    await fileSystem.remove(ownership.lockPath)
    if (ownership.quarantinePath) await fileSystem.remove(ownership.quarantinePath)
  } catch {
    throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_lock_release_failed')
  }
}

async function restorePriorPublication(
  fileSystem: EvaluationPublisherFileSystem,
  paths: EvaluationReportPaths,
  backups: EvaluationReportPaths,
  prior: { json: boolean, markdown: boolean }
): Promise<boolean> {
  const removals = await Promise.allSettled([
    fileSystem.remove(paths.json),
    fileSystem.remove(paths.markdown)
  ])
  const restores = await Promise.allSettled([
    prior.json ? fileSystem.rename(backups.json, paths.json) : Promise.resolve(),
    prior.markdown ? fileSystem.rename(backups.markdown, paths.markdown) : Promise.resolve()
  ])
  return [...removals, ...restores].every(result => result.status === 'fulfilled')
}

export async function publishEvaluationReports(
  outputDir: string,
  payload: EvaluationReportPayload,
  deps: EvaluationPublisherDependencies = {}
): Promise<EvaluationReportPaths> {
  const fileSystem = deps.fileSystem || defaultPublisherFileSystem
  const sleep = deps.sleep || delay
  const lockOptions: PublicationLockOptions = {
    now: deps.now || (() => Date.now()),
    ownerToken: (deps.ownerToken || (() => randomUUID()))(),
    leaseDurationMs: Math.max(1, deps.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MILLISECONDS),
    isOwnerActive: deps.isOwnerActive || defaultIsOwnerActive,
    recoverInvalidLease: deps.recoverInvalidLease
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
  const backupPaths = {
    json: join(outputDir, `.evaluation.json.${nonce}.backup`),
    markdown: join(outputDir, `.evaluation.md.${nonce}.backup`)
  }
  const prior = { json: false, markdown: false }
  let ownership: PublicationLockOwnership | undefined
  let publicationStarted = false
  let preserveBackups = false
  let primaryError: LakebaseEvaluationPublishError | undefined
  let publishedPaths: EvaluationReportPaths | undefined

  try {
    ownership = await acquirePublicationLock(fileSystem, lockPath, sleep, lockOptions)
    if (await recoveryMarkerExists(fileSystem, recoveryMarkerPath)) {
      throw new LakebaseEvaluationPublishError('lakebase_evaluation_recovery_required')
    }

    const writes = await Promise.allSettled([
      fileSystem.writeExclusive(temporaryPaths.json, payload.json),
      fileSystem.writeExclusive(temporaryPaths.markdown, payload.markdown)
    ])
    if (writes.some(result => result.status === 'rejected')) {
      throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_failed')
    }

    prior.json = await moveIfPresent(fileSystem, paths.json, backupPaths.json)
    try {
      prior.markdown = await moveIfPresent(fileSystem, paths.markdown, backupPaths.markdown)
    } catch (error) {
      if (prior.json) {
        try {
          await fileSystem.rename(backupPaths.json, paths.json)
        } catch {
          throw new LakebaseEvaluationPublishError('lakebase_evaluation_publish_rollback_failed')
        }
      }
      throw error
    }
    publicationStarted = true
    await fileSystem.rename(temporaryPaths.json, paths.json)
    await fileSystem.rename(temporaryPaths.markdown, paths.markdown)
    publishedPaths = paths
  } catch (error) {
    primaryError = stablePublishError(error)
    if (primaryError.code === 'lakebase_evaluation_publish_rollback_failed') {
      preserveBackups = true
    }
    if (publicationStarted) {
      const restored = await restorePriorPublication(fileSystem, paths, backupPaths, prior)
      if (!restored) {
        preserveBackups = true
        primaryError = new LakebaseEvaluationPublishError('lakebase_evaluation_publish_rollback_failed')
      }
    }
  }

  if (ownership) {
    const cleanupPaths = [temporaryPaths.json, temporaryPaths.markdown]
    if (!preserveBackups) cleanupPaths.push(backupPaths.json, backupPaths.markdown)
    const cleaned = await cleanupPublicationPaths(fileSystem, cleanupPaths)
    if (!cleaned) {
      preserveBackups = true
      const cleanupFailure = new LakebaseEvaluationPublishError(
        'lakebase_evaluation_publish_cleanup_failed'
      )
      if (primaryError) attachPublishFailure(primaryError, 'cleanupFailure', cleanupFailure)
      else primaryError = cleanupFailure
    }

    if (preserveBackups) {
      const markerPreserved = await preserveRecoveryMarker(fileSystem, recoveryMarkerPath)
      if (!markerPreserved) {
        const cleanupFailure = new LakebaseEvaluationPublishError(
          'lakebase_evaluation_publish_cleanup_failed'
        )
        if (primaryError) attachPublishFailure(primaryError, 'cleanupFailure', cleanupFailure)
        else primaryError = cleanupFailure
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
