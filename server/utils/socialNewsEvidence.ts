type UnknownRecord = Record<string, unknown>

export interface SocialNewsEvidenceProjection {
  evidenceId: string | null
  provider: string
  providerRecordId: string | null
  providerStoryUrl: string | null
  originalSourceUrl: string | null
  sourceName: string | null
  sourceType: string | null
  title: string | null
  snippet: string | null
  publishedAt: string | null
  fetchedAt: string | null
  topics: string[]
  make: string | null
  model: string | null
  entities: string[]
  geography: string[]
  image: string | null
  imageCredit: string | null
  coverageCount: number
  outlets: string[]
  summaryBullets: string[]
  dealerNote: string | null
  strategicAngle: string | null
  isAiDerivative: boolean
  attributionRequired: boolean
  rawChecksum: string | null
  connectorVersion: string | null
  evidenceSchemaVersion: number
  projectionWarnings: string[]
  observedFields: string[]
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  }
  return null
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return [...new Set(value.flatMap((entry) => {
    if (typeof entry === 'string') return entry.trim() ? [entry.trim()] : []

    const record = asRecord(entry)
    const label = firstString(record.name, record.label, record.source, record.outlet, record.title)
    return label ? [label] : []
  }))]
}

function finiteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const number = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(number)) return number
  }
  return null
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`

  const record = value as UnknownRecord
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`
}

function stableChecksum(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null

  let hash = 0x811c9dc5
  for (const character of stableSerialize(value)) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193)
  }

  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

/**
 * Converts a social_news_items row or API-shaped news item into the canonical
 * read-only evidence projection. The complete provider payload remains in
 * `raw`; this only promotes safe fields for reuse across platform surfaces.
 */
export function projectSocialNewsEvidence(value: unknown): SocialNewsEvidenceProjection {
  const item = asRecord(value)
  const raw = asRecord(item.raw)
  const summary = asRecord(raw.summary)

  const evidenceId = firstString(item.id, item.evidenceId)
  const providerRecordId = firstString(
    raw.id,
    raw.story_id,
    raw.storyId,
    raw.slug,
    item.external_id,
    item.externalId,
    evidenceId,
  )
  const providerStoryUrl = firstString(
    item.source_url,
    item.sourceUrl,
    raw.adme_url,
    raw.admeUrl,
    raw.url,
  )
  const originalSourceUrl = firstString(
    raw.original_source_url,
    raw.originalSourceUrl,
    raw.original_url,
    raw.originalUrl,
  )
  const summaryBullets = stringList(
    summary.bullets ?? raw.summary_bullets ?? raw.summaryBullets,
  )
  const dealerNote = firstString(
    summary.dealerNote,
    summary.dealer_note,
    raw.dealerNote,
    raw.dealer_note,
  )
  const strategicAngle = firstString(
    summary.angle,
    summary.strategicAngle,
    summary.strategic_angle,
    raw.strategicAngle,
    raw.strategic_angle,
  )
  const outlets = stringList(raw.outlets ?? raw.coverage_outlets ?? raw.coverageOutlets)
  const coverageCount = finiteNumber(
    raw.coverage_count,
    raw.coverageCount,
    outlets.length,
  ) ?? 0
  const entities = stringList(raw.entities)
  const geography = [
    ...stringList(raw.geography),
    ...stringList(raw.locations),
    ...stringList(raw.regions),
  ]
  const projectionWarnings = stringList(item.projection_warnings)

  if (!providerRecordId) projectionWarnings.push('missing_provider_record_id')
  if (!providerStoryUrl && !originalSourceUrl) projectionWarnings.push('missing_story_url')
  if (!firstString(item.title, raw.title)) projectionWarnings.push('missing_title')
  if (raw.topics !== undefined && !Array.isArray(raw.topics)) projectionWarnings.push('invalid_topics_shape')
  if (raw.outlets !== undefined && !Array.isArray(raw.outlets)) projectionWarnings.push('invalid_outlets_shape')

  return {
    evidenceId,
    provider: firstString(item.provider, raw.provider) ?? 'adme',
    providerRecordId,
    providerStoryUrl,
    originalSourceUrl,
    sourceName: firstString(item.author, raw.source, raw.source_name, raw.sourceName),
    sourceType: firstString(raw.source_type, raw.sourceType),
    title: firstString(item.title, raw.title),
    snippet: firstString(item.summary, item.description, item.snippet, raw.snippet, raw.description),
    publishedAt: firstString(item.published_at, item.publishedAt, raw.published_at, raw.publishedAt, raw.published),
    fetchedAt: firstString(item.fetched_at, item.fetchedAt, item.created_at, item.createdAt, raw.fetched_at, raw.fetchedAt),
    topics: stringList(raw.topics ?? item.topics),
    make: firstString(raw.make, item.make),
    model: firstString(raw.model, item.model),
    entities: [...new Set(entities)],
    geography: [...new Set(geography)],
    image: firstString(raw.image, raw.image_url, raw.imageUrl, item.image, item.image_url),
    imageCredit: firstString(raw.image_credit, raw.imageCredit),
    coverageCount: Math.max(0, Math.trunc(coverageCount)),
    outlets,
    summaryBullets,
    dealerNote,
    strategicAngle,
    isAiDerivative: Boolean(summaryBullets.length || dealerNote || strategicAngle),
    attributionRequired: Boolean(providerStoryUrl || originalSourceUrl),
    rawChecksum: firstString(item.raw_checksum, item.rawChecksum, raw.checksum) ?? stableChecksum(raw),
    connectorVersion: firstString(item.connector_version, item.connectorVersion, raw.connector_version, raw.connectorVersion) ?? 'mcp-news-v1',
    evidenceSchemaVersion: Math.max(1, Math.trunc(finiteNumber(item.evidence_schema_version, item.evidenceSchemaVersion) ?? 1)),
    projectionWarnings: [...new Set(projectionWarnings)],
    observedFields: Object.keys(raw).sort(),
  }
}
