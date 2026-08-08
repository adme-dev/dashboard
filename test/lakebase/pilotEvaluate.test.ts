import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
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
    rename,
    async remove(path) {
      await rm(path, { recursive: true, force: true })
    }
  }
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
      async makeDirectory(path, recursive) {
        if (basename(path) === '.evaluation.lock') {
          lockAttempts += 1
          if (lockAttempts > 1) secondLockAttempted.resolve()
        }
        await fileSystem.makeDirectory(path, recursive)
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
