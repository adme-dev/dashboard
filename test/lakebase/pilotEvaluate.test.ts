import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  parseEvaluateArgs,
  runLakebaseEvaluation,
  type LakebaseEvaluationDependencies
} from '../../scripts/lakebase-pilot/evaluate'
import type { LakebasePilotFixture } from '../../scripts/lakebase-pilot/setup'
import type { PilotDatabase, PilotDatabaseQuery } from '../../scripts/lakebase-pilot/database'
import type { PilotSearchHit } from '../../scripts/lakebase-pilot/search'

const fixturePath = new URL('../fixtures/lakebase-crm-search.json', import.meta.url)
const temporaryDirectories: string[] = []

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
    title: 'Sensitive title that must not be reported',
    subtitle: 'operator@example.com',
    rank: 1
  }
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
      NEON_API_KEY: 'neon-api-key-must-not-leak',
      OPERATOR_EMAIL: 'owner@production.example'
    },
    resolveTarget: () => ({
      projectId: 'pilot-project-must-not-leak',
      endpointId: 'pilot-endpoint-must-not-leak',
      databaseUrl: 'postgresql://pilot:database-password@pilot.invalid/app',
      databaseHost: 'pilot.invalid',
      productionProjectId: 'production-project-must-not-leak'
    }),
    createDatabase: async () => fakeDatabase(),
    fixture,
    now: () => new Date('2026-08-08T01:02:03.000Z'),
    ...overrides
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
    for (const query of fixture.queries) expect(evidence).not.toContain(query.query)
    for (const document of fixture.documents) expect(evidence).not.toContain(document.id)
    expect(evidence).not.toMatch(/postgres(?:ql)?:\/\//i)
    expect(evidence).not.toMatch(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)
    expect(evidence).not.toContain('neon-api-key-must-not-leak')
    expect(evidence).not.toContain('production-project-must-not-leak')
    expect(markdown).toContain('Passing grants review eligibility only')
  })

  it('records failures, fallbacks, and fixture-derived leakage and returns a hold exit', async () => {
    const fixture = await loadFixture()
    const outputDir = await temporaryOutputDirectory()
    const deletedId = fixture.documents.find(document => document.deleted)!.id
    const otherClientId = fixture.documents.find(document => (
      document.clientId !== fixture.queries[0]!.clientId
    ))!.id
    let elapsed = 0
    const result = await runLakebaseEvaluation(
      { runs: 1, coldStart: false, outputDir },
      injectedDependencies(fixture, {
        nowMs: () => elapsed,
        searchLegacy: async (_database, _clientId, term) => {
          elapsed += 10
          return term === fixture.queries[0]!.query ? [hit(deletedId)] : []
        },
        searchBm25: async (_database, _clientId, term) => {
          elapsed += 5
          if (term === fixture.queries[1]!.query) throw new Error('database-password')
          return term === fixture.queries[0]!.query
            ? { hits: [hit(otherClientId)], fallback: true }
            : []
        }
      })
    )

    expect(result.exitCode).toBe(1)
    expect(result.report.gate).toMatchObject({ status: 'hold', passed: false })
    expect(result.report.engines.legacy.softDeleteLeakage).toBeGreaterThan(0)
    expect(result.report.engines.bm25.crossClientLeakage).toBeGreaterThan(0)
    expect(result.report.engines.bm25.failures).toBeGreaterThan(0)
    expect(result.report.engines.bm25.fallbacks).toBeGreaterThan(0)

    const evidence = await readFile(join(outputDir, 'evaluation.json'), 'utf8')
    expect(evidence).not.toContain(deletedId)
    expect(evidence).not.toContain(otherClientId)
    expect(evidence).not.toContain('database-password')
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
