import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'
import type { AutomotivePageFacts, SiteIntelligencePageStatus } from '~~/app/types/site-intelligence'
import type { SiteIntelligenceCrawlRecord } from '~~/server/utils/siteIntelligence/contracts'
import { getCachedObjectBinding } from '~~/server/utils/email'
import {
  AUTOMOTIVE_EXTRACTION_VERSION,
  canonicalizeAutomotiveContent,
  canonicalizeSiteIntelligenceUrl,
  extractAutomotiveFacts,
  type AutomotiveFactEvidence
} from '~~/server/utils/siteIntelligence/extractAutomotiveFacts'

interface PrivateSiteIntelligenceBucket {
  put: (key: string, value: string, options?: {
    httpMetadata?: { contentType?: string }
    customMetadata?: Record<string, string>
  }) => Promise<unknown | null>
  delete: (key: string | string[]) => Promise<void>
}

export interface PreparedSiteIntelligenceRecord {
  canonicalUrl: string
  sourceUrl: string
  status: SiteIntelligencePageStatus
  httpStatus: number | null
  title: string | null
  contentHash: string | null
  r2ObjectKey: string | null
  metadata: Record<string, string | number>
  facts: Partial<AutomotivePageFacts>
  evidence: AutomotiveFactEvidence[]
  extractionVersion: string
}

interface PrepareSnapshotInput {
  clientId: string
  domainId: string
  runId: string
  record: SiteIntelligenceCrawlRecord
}

export async function prepareSiteIntelligenceSnapshot(
  event: H3Event | undefined,
  input: PrepareSnapshotInput
): Promise<PreparedSiteIntelligenceRecord> {
  const sourceUrl = canonicalizeSiteIntelligenceUrl(input.record.url)
  const canonicalUrl = canonicalizeSiteIntelligenceUrl(input.record.metadata.url || sourceUrl)
  const body = input.record.markdown ?? input.record.html ?? ''
  const safeMetadata = compactMetadata(input.record.metadata, canonicalUrl)

  if (input.record.status !== 'completed' || !body.trim()) {
    return {
      canonicalUrl,
      sourceUrl,
      status: input.record.status,
      httpStatus: input.record.metadata.status ?? null,
      title: input.record.metadata.title?.trim().slice(0, 1000) || null,
      contentHash: null,
      r2ObjectKey: null,
      metadata: safeMetadata,
      facts: {},
      evidence: [],
      extractionVersion: AUTOMOTIVE_EXTRACTION_VERSION
    }
  }

  const extractionMetadata = {
    ...safeMetadata,
    jsonLd: extractJsonLd(input.record.html)
  }
  const extraction = extractAutomotiveFacts(input.record.markdown ?? stripHtml(input.record.html ?? ''), extractionMetadata)
  const contentHash = createHash('sha256').update(canonicalizeAutomotiveContent(body), 'utf8').digest('hex')
  const r2ObjectKey = snapshotKey(input.clientId, input.domainId, input.runId, contentHash)
  const bucket = resolveBucket(event)
  if (!bucket) throw new Error('Private site intelligence storage is not configured')
  const stored = await bucket.put(r2ObjectKey, body, {
    httpMetadata: { contentType: input.record.markdown ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8' },
    customMetadata: {
      clientId: input.clientId,
      domainId: input.domainId,
      runId: input.runId,
      contentHash
    }
  })
  if (stored === null) throw new Error('Private site intelligence snapshot write was rejected')

  return {
    canonicalUrl: extraction.canonicalUrl || canonicalUrl,
    sourceUrl,
    status: input.record.status,
    httpStatus: input.record.metadata.status ?? null,
    title: input.record.metadata.title?.trim().slice(0, 1000) || null,
    contentHash,
    r2ObjectKey,
    metadata: safeMetadata,
    facts: extraction.facts,
    evidence: extraction.evidence,
    extractionVersion: extraction.extractionVersion
  }
}

export async function deleteSiteIntelligenceSnapshots(
  event: H3Event | undefined,
  keys: string[]
): Promise<void> {
  if (!keys.length) return
  const bucket = resolveBucket(event)
  if (!bucket) return
  await bucket.delete(keys)
}

export function recordOrphanSiteIntelligenceSnapshots(keys: string[], reason: unknown): void {
  if (!keys.length) return
  const message = reason instanceof Error ? reason.message : String(reason)
  console.error('[SiteIntelligence] orphan snapshots pending reconciliation', {
    keys: [...new Set(keys)].sort(),
    reason: message.slice(0, 500)
  })
}

function resolveBucket(event: H3Event | undefined): PrivateSiteIntelligenceBucket | undefined {
  const direct = (event?.context as { cloudflare?: { env?: Record<string, unknown> } } | undefined)
    ?.cloudflare?.env?.SITE_INTELLIGENCE_BUCKET
  if (direct && typeof direct === 'object') return direct as PrivateSiteIntelligenceBucket
  return getCachedObjectBinding<PrivateSiteIntelligenceBucket>('SITE_INTELLIGENCE_BUCKET')
}

function snapshotKey(clientId: string, domainId: string, runId: string, contentHash: string): string {
  return `clients/${clientId}/domains/${domainId}/runs/${runId}/${contentHash}.md`
}

function compactMetadata(
  metadata: SiteIntelligenceCrawlRecord['metadata'],
  canonicalUrl: string
): Record<string, string | number> {
  return {
    url: canonicalUrl,
    ...(metadata.status !== undefined ? { status: metadata.status } : {}),
    ...(metadata.title?.trim() ? { title: metadata.title.trim().slice(0, 1000) } : {})
  }
}

function extractJsonLd(html: string | undefined): unknown {
  if (!html) return undefined
  const values: unknown[] = []
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const match of html.matchAll(pattern)) {
    if (!match[1] || match[1].length > 500_000) continue
    try {
      values.push(JSON.parse(match[1]))
    } catch {
      continue
    }
  }
  return values.length === 1 ? values[0] : values
}

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}
