import { createHash } from 'node:crypto'
import {
  CRM_SEARCH_EVALUATION_SCHEMA_VERSION,
  type CrmSearchFixtureBundle
} from './contracts'

const sha256Pattern = /^[a-f0-9]{64}$/u
const forbiddenKeys = new Set([
  'email',
  'emailaddress',
  'phone',
  'phonenumber',
  'rawquery',
  'querytext',
  'sourcetext',
  'notes',
  'providerpayload',
  'providerbody',
  'vector',
  'embedding'
])
const emailPattern = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u
const phonePattern = /(?:\+?\d[\d ()-]{7,}\d)/u

function containsPiiLikeValue(value: string): boolean {
  if (emailPattern.test(value)) return true
  const digitCount = value.replace(/\D/gu, '').length
  return digitCount >= 8 && digitCount <= 15 && phonePattern.test(value)
}

function fail(message: string): never {
  throw new Error(`Invalid CRM search evaluation fixture: ${message}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]))
}

export function computeCrmSearchFixtureSha256(value: Record<string, unknown>): string {
  const { sha256: _declaredDigest, ...payload } = value
  return createHash('sha256').update(JSON.stringify(canonicalize(payload)), 'utf8').digest('hex')
}

function normalizeKey(key: string): string {
  return key.normalize('NFKC').toLocaleLowerCase('en-AU').replace(/[^a-z0-9]/gu, '')
}

function assertPrivacySafe(value: unknown, key = ''): void {
  const normalizedKey = normalizeKey(key)
  if (forbiddenKeys.has(normalizedKey)) fail(`sensitive or raw key ${key}`)
  if (typeof value === 'string' && containsPiiLikeValue(value)) {
    fail('PII-like string')
  }
  if (Array.isArray(value)) {
    for (const item of value) assertPrivacySafe(item)
    return
  }
  if (isRecord(value)) {
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      assertPrivacySafe(nestedValue, nestedKey)
    }
  }
}

function requireString(value: unknown, label: string, maximum = 240): asserts value is string {
  if (typeof value !== 'string' || value.trim().length < 1 || value.length > maximum) fail(label)
}

function requireDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !sha256Pattern.test(value)) fail(label)
}

function requireUniqueStrings(values: unknown, label: string, minimum = 0): asserts values is string[] {
  if (!Array.isArray(values) || values.length < minimum || values.some(value => typeof value !== 'string' || !value)) {
    fail(label)
  }
  if (new Set(values).size !== values.length) fail(`${label} must be unique`)
}

function intersects(left: string[], right: string[]): boolean {
  const rightSet = new Set(right)
  return left.some(value => rightSet.has(value))
}

export function validateEvaluationFixtureBundle(value: unknown): CrmSearchFixtureBundle {
  if (!isRecord(value)) fail('bundle must be an object')
  assertPrivacySafe(value)
  const bundle = value as unknown as CrmSearchFixtureBundle

  if (bundle.schemaVersion !== CRM_SEARCH_EVALUATION_SCHEMA_VERSION) fail('schema version')
  if (!isRecord(bundle.corpus) || bundle.corpus.piiFree !== true || !Array.isArray(bundle.corpus.records)) {
    fail('PII-free corpus')
  }
  requireString(bundle.corpus.version, 'corpus version')
  requireDigest(bundle.corpus.sha256, 'corpus digest')
  if (bundle.corpus.sha256 !== computeCrmSearchFixtureSha256(bundle.corpus)) fail('corpus digest mismatch')

  if (!isRecord(bundle.development) || !Array.isArray(bundle.development.queries)
    || bundle.development.queries.length < 180) fail('at least 180 development queries')
  requireString(bundle.development.version, 'development version')
  requireDigest(bundle.development.sha256, 'development digest')
  if (bundle.development.sha256 !== computeCrmSearchFixtureSha256(bundle.development)) fail('development digest mismatch')
  const developmentClients = new Set<string>()
  for (const query of bundle.development.queries) {
    if (!isRecord(query)) fail('development query')
    requireDigest(query.queryKeyDigest, 'development query digest')
    requireString(query.clientKey, 'development client key')
    developmentClients.add(query.clientKey)
    if (!['person', 'company', 'opportunity'].includes(query.entityType)) fail('development entity type')
    requireUniqueStrings(query.strata, 'development strata', 1)
    requireUniqueStrings(query.relevantEntityDigests, 'relevant entity digests')
    for (const entityDigest of query.relevantEntityDigests) requireDigest(entityDigest, 'relevant entity digest')
  }
  if (developmentClients.size < 3) fail('development client coverage')

  const holdout = bundle.holdoutManifest
  if (!isRecord(holdout) || holdout.sealed !== true || holdout.queryCount < 360) fail('sealed 360-query holdout')
  requireString(holdout.version, 'holdout version')
  requireDigest(holdout.sha256, 'holdout manifest digest')
  if (holdout.sha256 !== computeCrmSearchFixtureSha256(holdout)) fail('holdout manifest digest mismatch')
  requireDigest(holdout.sealedJudgementSha256, 'sealed judgement digest')
  if (!isRecord(holdout.clientCounts)) fail('holdout client counts')
  const qualifyingClients = Object.values(holdout.clientCounts)
    .filter(count => Number.isInteger(count) && count >= 80)
  if (qualifyingClients.length < 3) fail('at least three holdout clients with 80 queries')
  if (!isRecord(holdout.entityTypeCounts)
    || holdout.entityTypeCounts.person < 60
    || holdout.entityTypeCounts.company < 60
    || holdout.entityTypeCounts.opportunity < 60) fail('holdout entity minima')
  if (!isRecord(holdout.strataCounts)) fail('holdout stratum minima')
  const requiredStrata = {
    natural_language: 120,
    exact_name_or_identifier: 60,
    no_result: 60,
    cross_client_overlap: 60
  } as const
  if (Object.entries(requiredStrata).some(([stratum, minimum]) => {
    const count = holdout.strataCounts[stratum]
    return typeof count !== 'number' || !Number.isInteger(count) || count < minimum
  })) fail('holdout stratum minima')

  const preregistration = bundle.preregistration
  if (!isRecord(preregistration)) fail('preregistration')
  requireDigest(preregistration.sha256, 'preregistration digest')
  if (preregistration.sha256 !== computeCrmSearchFixtureSha256(preregistration)) fail('preregistration digest mismatch')
  requireString(preregistration.frozenAt, 'preregistration freeze')
  if (!Number.isFinite(Date.parse(preregistration.frozenAt))) fail('preregistration freeze timestamp')
  requireUniqueStrings(preregistration.candidateIds, 'candidate identifiers', 1)
  requireString(preregistration.selectionRule, 'selection rule', 2_000)

  const adjudication = bundle.adjudicationManifest
  if (!isRecord(adjudication)) fail('adjudication manifest')
  requireDigest(adjudication.sha256, 'adjudication digest')
  if (adjudication.sha256 !== computeCrmSearchFixtureSha256(adjudication)) fail('adjudication digest mismatch')
  requireUniqueStrings(adjudication.implementationAuthorIds, 'implementation authors')
  requireUniqueStrings(adjudication.fixtureAuthorIds, 'fixture authors')
  requireUniqueStrings(adjudication.judgementAuthorIds, 'judgement authors', 2)
  requireUniqueStrings(adjudication.domainReviewerIds, 'domain reviewers', 2)
  requireUniqueStrings(adjudication.adjudicatorIds, 'adjudicators', 1)
  if (intersects(adjudication.implementationAuthorIds, adjudication.domainReviewerIds)
    || intersects(adjudication.implementationAuthorIds, adjudication.judgementAuthorIds)
    || intersects(adjudication.fixtureAuthorIds, adjudication.domainReviewerIds)
    || intersects(adjudication.fixtureAuthorIds, adjudication.judgementAuthorIds)) {
    fail('actor separation')
  }
  if (!Number.isInteger(adjudication.disagreementCount)
    || adjudication.disagreementCount < 0
    || adjudication.resolvedCount !== adjudication.disagreementCount) fail('adjudication provenance')

  return Object.freeze(bundle)
}
