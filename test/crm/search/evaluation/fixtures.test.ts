import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  computeCrmSearchFixtureSha256,
  validateEvaluationFixtureBundle
} from '~~/server/utils/crm/search/evaluation/fixtures'

const digest = (character: string) => character.repeat(64)

function buildDevelopmentQueries(count = 180) {
  const entityTypes = ['person', 'company', 'opportunity'] as const
  return Array.from({ length: count }, (_, index) => ({
    queryKeyDigest: digest((index % 10).toString()),
    clientKey: `client-${(index % 3) + 1}`,
    entityType: entityTypes[index % entityTypes.length],
    strata: index % 3 === 0 ? ['natural_language'] : ['exact_name'],
    relevantEntityDigests: [digest(((index + 1) % 10).toString())]
  }))
}

function validFixtureBundle() {
  const fixture = {
    schemaVersion: 'crm-search-evaluation-v1',
    corpus: {
      version: 'synthetic-corpus-v1',
      sha256: '',
      piiFree: true,
      records: [{
        entityKeyDigest: digest('b'),
        clientKey: 'client-1',
        entityType: 'company',
        approvedProjection: 'company | Example Motors | automotive'
      }]
    },
    development: {
      version: 'development-v1',
      sha256: '',
      queries: buildDevelopmentQueries()
    },
    holdoutManifest: {
      version: 'holdout-v1',
      sha256: '',
      sealed: true,
      sealedJudgementSha256: digest('d'),
      queryCount: 360,
      clientCounts: { 'client-1': 120, 'client-2': 120, 'client-3': 120 },
      entityTypeCounts: { person: 120, company: 120, opportunity: 120 },
      strataCounts: {
        natural_language: 120,
        exact_name_or_identifier: 60,
        no_result: 60,
        cross_client_overlap: 60
      }
    },
    preregistration: {
      sha256: '',
      frozenAt: '2026-08-01T00:00:00.000Z',
      candidateIds: ['keyword-v1', 'rrf-v1'],
      selectionRule: 'Choose the eligible candidate with the highest natural-language nDCG@10.'
    },
    adjudicationManifest: {
      sha256: '',
      implementationAuthorIds: ['implementer-1'],
      fixtureAuthorIds: ['fixture-author-1'],
      judgementAuthorIds: ['judge-1', 'judge-2'],
      domainReviewerIds: ['reviewer-1', 'reviewer-2'],
      adjudicatorIds: ['adjudicator-1'],
      disagreementCount: 4,
      resolvedCount: 4
    }
  }
  fixture.corpus.sha256 = computeCrmSearchFixtureSha256(fixture.corpus)
  fixture.development.sha256 = computeCrmSearchFixtureSha256(fixture.development)
  fixture.holdoutManifest.sha256 = computeCrmSearchFixtureSha256(fixture.holdoutManifest)
  fixture.preregistration.sha256 = computeCrmSearchFixtureSha256(fixture.preregistration)
  fixture.adjudicationManifest.sha256 = computeCrmSearchFixtureSha256(fixture.adjudicationManifest)
  return fixture
}

describe('CRM search evaluation fixtures', () => {
  it('ships a checked-in redacted development constitution and sealed holdout manifests', () => {
    const readJson = (fileName: string) => JSON.parse(readFileSync(
      `test/fixtures/crm-search-evaluation/${fileName}`,
      'utf8'
    )) as unknown
    const checkedIn = validateEvaluationFixtureBundle({
      schemaVersion: 'crm-search-evaluation-v1',
      corpus: readJson('corpus.json'),
      development: readJson('development.json'),
      holdoutManifest: readJson('holdout.manifest.json'),
      preregistration: readJson('preregistration.json'),
      adjudicationManifest: readJson('adjudication.manifest.json')
    })
    const schema = JSON.parse(readFileSync('test/fixtures/crm-search-evaluation.schema.json', 'utf8'))
    const sample = JSON.parse(readFileSync('test/fixtures/crm-search-evaluation.sample.json', 'utf8'))

    expect(checkedIn.development.queries).toHaveLength(180)
    expect(checkedIn.holdoutManifest.queryCount).toBe(360)
    expect(schema).toMatchObject({ $schema: 'https://json-schema.org/draft/2020-12/schema', additionalProperties: false })
    expect(sample).toMatchObject({ schemaVersion: 'crm-search-evaluation-v1' })
    expect(JSON.stringify({ checkedIn, sample })).not.toMatch(/rawQuery|sourceText|email|phone|notes/i)
  })

  it('accepts only the frozen PII-free constitution with development and sealed holdout minima', () => {
    const parsed = validateEvaluationFixtureBundle(validFixtureBundle())

    expect(parsed.development.queries).toHaveLength(180)
    expect(Object.keys(parsed.holdoutManifest.clientCounts)).toHaveLength(3)
    expect(parsed.holdoutManifest).toMatchObject({
      sealed: true,
      queryCount: 360,
      entityTypeCounts: { person: 120, company: 120, opportunity: 120 },
      strataCounts: {
        natural_language: 120,
        exact_name_or_identifier: 60,
        no_result: 60,
        cross_client_overlap: 60
      }
    })
  })

  type FixtureBundle = ReturnType<typeof validFixtureBundle>
  type FixtureMutation = (fixture: FixtureBundle) => void
  const invalidFixtureCases: Array<[string, FixtureMutation]> = [
    ['too few development queries', (fixture) => { fixture.development.queries.length = 179 }],
    ['too few clients', (fixture) => { fixture.holdoutManifest.clientCounts = { 'client-1': 360, 'client-2': 0, 'client-3': 0 } }],
    ['unsealed labels', (fixture) => { fixture.holdoutManifest.sealed = false }],
    ['missing preregistration freeze', (fixture) => { fixture.preregistration.frozenAt = '' }],
    ['one reviewer', (fixture) => { fixture.adjudicationManifest.domainReviewerIds = ['reviewer-1'] }],
    ['implementer reviews', (fixture) => { fixture.adjudicationManifest.domainReviewerIds[0] = 'implementer-1' }],
    ['fixture author judges', (fixture) => { fixture.adjudicationManifest.judgementAuthorIds[0] = 'fixture-author-1' }],
    ['unresolved adjudication', (fixture) => { fixture.adjudicationManifest.resolvedCount = 3 }]
  ]

  it.each(invalidFixtureCases)('rejects %s', (_label, mutate) => {
    const fixture = validFixtureBundle()
    mutate(fixture)
    expect(() => validateEvaluationFixtureBundle(fixture)).toThrow()
  })

  it.each(['email', 'phone', 'rawQuery', 'sourceText', 'notes', 'providerPayload'])(
    'recursively rejects the sensitive key %s',
    (key) => {
      const fixture = validFixtureBundle()
      Object.assign(fixture.corpus.records[0]!, { nested: { [key]: 'alex@example.invalid' } })

      expect(() => validateEvaluationFixtureBundle(fixture)).toThrow(/PII|raw|sensitive/i)
    }
  )

  it('rejects redacted fixture content changed without a new pinned digest', () => {
    const fixture = validFixtureBundle()
    fixture.development.queries[0]!.strata.push('cross_client_overlap')
    expect(() => validateEvaluationFixtureBundle(fixture)).toThrow(/digest mismatch/i)
  })

  it('recursively rejects sensitive values under arbitrary field names', () => {
    const fixture = validFixtureBundle()
    Object.assign(fixture.corpus.records[0]!, {
      nested: { arbitraryComment: ['safe', { value: 'alex@example.invalid' }] }
    })
    fixture.corpus.sha256 = computeCrmSearchFixtureSha256(fixture.corpus)

    expect(() => validateEvaluationFixtureBundle(fixture)).toThrow(/PII|sensitive/i)
  })

  it('binds every holdout manifest field to its own checked-in digest', () => {
    const fixture = validFixtureBundle()
    fixture.holdoutManifest.queryCount += 1

    expect(() => validateEvaluationFixtureBundle(fixture)).toThrow(/holdout manifest digest mismatch/i)
  })
})
