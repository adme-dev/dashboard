import { queryOne } from '~~/server/utils/db'
import { normalizeSocialNewsClientProfile, type SocialNewsClientProfile } from '~~/server/utils/socialNewsProfile'

const PUBLISH_PLATFORMS = new Set(['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'google-business'])
const EVIDENCE_TYPES = new Set(['brief', 'decision', 'plan', 'discussion', 'performance'])
const SOURCE_SYSTEMS = new Set(['xeroflow', 'monday', 'slack', 'manual', 'import'])
const REVIEW_STATUSES = new Set(['pending', 'approved', 'rejected', 'superseded'])

function cleanText(value: unknown, max = 2_000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function positiveInteger(value: unknown, max = 10_000): number | undefined {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? Math.min(number, max) : undefined
}

export interface SocialPackageCommercialScope {
  includedPostVolumes: Record<string, number>
  approvalSlaHours?: number
  overagePolicy: 'block' | 'warn' | 'quote-before-work' | 'allow'
}

export interface SocialContentPackageInput {
  name: string
  industry: string
  description: string
  profileDefaults: SocialNewsClientProfile
  commercialScope: SocialPackageCommercialScope
}

export function normalizeSocialContentPackageInput(input: Record<string, unknown> = {}): SocialContentPackageInput {
  const profileDefaults = normalizeSocialNewsClientProfile(
    input.profileDefaults && typeof input.profileDefaults === 'object'
      ? input.profileDefaults as Record<string, unknown>
      : {},
  )
  const rawScope = input.commercialScope && typeof input.commercialScope === 'object'
    ? input.commercialScope as Record<string, unknown>
    : {}
  const rawVolumes = rawScope.includedPostVolumes && typeof rawScope.includedPostVolumes === 'object'
    ? rawScope.includedPostVolumes as Record<string, unknown>
    : {}
  const includedPostVolumes: Record<string, number> = {}
  for (const [platform, raw] of Object.entries(rawVolumes)) {
    const volume = positiveInteger(raw, 1_000)
    if (PUBLISH_PLATFORMS.has(platform) && volume !== undefined) includedPostVolumes[platform] = volume
  }
  const sla = positiveInteger(rawScope.approvalSlaHours, 24 * 30)
  const overage = cleanText(rawScope.overagePolicy, 40)
  return {
    name: cleanText(input.name, 200),
    industry: cleanText(input.industry, 200),
    description: cleanText(input.description, 4_000),
    profileDefaults,
    commercialScope: {
      includedPostVolumes,
      ...(sla === undefined ? {} : { approvalSlaHours: sla }),
      overagePolicy: ['block', 'warn', 'quote-before-work', 'allow'].includes(overage)
        ? overage as SocialPackageCommercialScope['overagePolicy']
        : 'warn',
    },
  }
}

export function mergeSocialPackageProfile(
  packageInput: Record<string, unknown>,
  currentInput: Record<string, unknown> | null,
  clientId: string,
): SocialNewsClientProfile {
  const packageProfile = normalizeSocialNewsClientProfile(packageInput)
  const existing = currentInput ? normalizeSocialNewsClientProfile(currentInput) : null
  return normalizeSocialNewsClientProfile({
    clientId,
    sourceBriefId: existing?.sourceBriefId || packageProfile.sourceBriefId,
    industry: existing?.industry || packageProfile.industry,
    targetAudience: existing?.targetAudience || packageProfile.targetAudience,
    contentPillars: existing?.contentPillars.length ? existing.contentPillars : packageProfile.contentPillars,
    includeKeywords: existing?.includeKeywords.length ? existing.includeKeywords : packageProfile.includeKeywords,
    excludeKeywords: existing?.excludeKeywords.length ? existing.excludeKeywords : packageProfile.excludeKeywords,
    makes: existing?.makes.length ? existing.makes : packageProfile.makes,
    brandVoice: existing?.brandVoice || packageProfile.brandVoice,
    defaultTone: existing ? existing.defaultTone : packageProfile.defaultTone,
    aiInstructions: existing?.aiInstructions || packageProfile.aiInstructions,
    preferredPlatforms: existing?.preferredPlatforms.length ? existing.preferredPlatforms : packageProfile.preferredPlatforms,
    timezone: existing ? existing.timezone : packageProfile.timezone,
    defaultWorkflow: existing ? existing.defaultWorkflow : packageProfile.defaultWorkflow,
  })
}

export interface ClientEvidenceInput {
  evidenceType: 'brief' | 'decision' | 'plan' | 'discussion' | 'performance'
  sourceSystem: 'xeroflow' | 'monday' | 'slack' | 'manual' | 'import'
  sourceId: string | null
  sourceUrl: string | null
  title: string
  content: string
  summary: string
  occurredAt: string | null
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'superseded'
  projectId: string | null
  briefId: string | null
}

export function normalizeClientEvidenceInput(input: Record<string, unknown> = {}): ClientEvidenceInput {
  const type = cleanText(input.evidenceType, 40)
  const source = cleanText(input.sourceSystem, 40)
  const requestedStatus = cleanText(input.reviewStatus, 40)
  const sourceSystem = SOURCE_SYSTEMS.has(source) ? source as ClientEvidenceInput['sourceSystem'] : 'manual'
  // Imported conversations are evidence, not approved instructions. A human must promote them in XeroFlow.
  const reviewStatus = sourceSystem === 'monday' || sourceSystem === 'slack' || sourceSystem === 'import'
    ? 'pending'
    : REVIEW_STATUSES.has(requestedStatus) ? requestedStatus as ClientEvidenceInput['reviewStatus'] : 'pending'
  let occurredAt: string | null = null
  const rawOccurredAt = cleanText(input.occurredAt, 100)
  if (rawOccurredAt) {
    const parsed = new Date(rawOccurredAt)
    if (!Number.isNaN(parsed.getTime())) occurredAt = parsed.toISOString()
  }
  let sourceUrl: string | null = null
  const rawSourceUrl = cleanText(input.sourceUrl, 2_000)
  if (rawSourceUrl) {
    try {
      const parsed = new URL(rawSourceUrl)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') sourceUrl = parsed.toString()
    } catch { /* omit invalid external provenance links */ }
  }
  return {
    evidenceType: EVIDENCE_TYPES.has(type) ? type as ClientEvidenceInput['evidenceType'] : 'discussion',
    sourceSystem,
    sourceId: cleanText(input.sourceId, 500) || null,
    sourceUrl,
    title: cleanText(input.title, 300),
    content: cleanText(input.content, 20_000),
    summary: cleanText(input.summary, 2_000),
    occurredAt,
    reviewStatus,
    projectId: cleanText(input.projectId, 100) || null,
    briefId: cleanText(input.briefId, 100) || null,
  }
}

export interface ActiveSocialPackageRef { assignmentId: string; packageVersionId: string }

export async function loadActiveSocialPackageRef(clientId: string): Promise<ActiveSocialPackageRef | null> {
  const row = await queryOne<{ assignment_id: string; package_version_id: string }>(
    `SELECT id AS assignment_id, package_version_id
       FROM social_content_package_assignments
      WHERE client_id = $1 AND status = 'active'
        AND starts_on <= CURRENT_DATE
        AND (ends_on IS NULL OR ends_on >= CURRENT_DATE)
      ORDER BY starts_on DESC, created_at DESC
      LIMIT 1`,
    [clientId],
  )
  return row ? { assignmentId: row.assignment_id, packageVersionId: row.package_version_id } : null
}

export function buildSocialPackagePostMetadata(ref: ActiveSocialPackageRef | null): Record<string, string> {
  return ref ? {
    socialPackageAssignmentId: ref.assignmentId,
    socialPackageVersionId: ref.packageVersionId,
  } : {}
}
