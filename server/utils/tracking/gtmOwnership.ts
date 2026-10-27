import { createHash } from 'node:crypto'
import { z } from 'zod'
import { createError } from 'h3'
import { queryOneFresh } from '~~/server/utils/db'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { assertGtmSite } from '~~/server/utils/ai/marketing/gtmAccess'

const note = z.string().trim().min(10).max(1500)
const publicUrl = z
  .string()
  .url()
  .max(500)
  .refine((v) => {
    const u = new URL(v)
    return (
      u.protocol === 'https:'
      && !u.username
      && !u.password
      && !u.search
      && !u.hash
    )
  }, 'Use an exact public HTTPS endpoint without secrets or query strings')
export const GtmOwnershipSchema = z
  .strictObject({
    publicHost: z
      .string()
      .regex(/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/),
    formEndpoint: publicUrl,
    siteKind: z.enum(['native_driveagent', 'external']),
    dealerId: z.string().trim().min(1).max(100),
    conversionOwner: z.enum(['driveagent', 'external_backend', 'xeroflow']),
    browserRequirement: note,
    consentPolicy: note,
    existingProviderHooks: note,
    nativeServerAssessment: note,
    deduplicationAssessment: note,
    conversionDeliveryEvidence: note,
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
    guideRevision: note,
    wikiRevision: note,
    graphRevision: note,
    staleAreas: z.string().max(1500),
    verifiedAgainstCurrentSource: z.literal(true),
    consentOwner: z.string().trim().min(1).max(200),
    acceptedLeadRoutingUnchanged: z.literal(true)
  })
  .superRefine((v, ctx) => {
    if (
      v.siteKind === 'native_driveagent'
      && v.conversionOwner !== 'driveagent'
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Native DriveAgent accepted enquiries retain native server conversion ownership'
      })
  })
export function gtmHash(value: unknown): string {
  const canonical = (v: any): any =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map(k => [k, canonical(v[k])])
          )
        : v
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')
}
export async function recordGtmOwnership(
  ctx: ToolContext,
  raw: unknown,
  key: string
) {
  const input = z
    .strictObject({ siteId: z.string().uuid(), evidence: GtmOwnershipSchema })
    .parse(raw)
  const site = await assertGtmSite(ctx, input.siteId, true)
  if (!site.allowed_origins.includes(`https://${input.evidence.publicHost}`))
    throw createError({
      statusCode: 409,
      statusMessage: 'Evidence host does not match tracking site'
    })
  const hash = gtmHash(input)
  const saved = await queryOneFresh<any>(
    `INSERT INTO gtm_tracking_ownership_evidence(client_id,site_id,recorded_by,evidence,evidence_hash,idempotency_key) VALUES($1,$2,$3,$4::jsonb,$5,$6) ON CONFLICT(recorded_by,idempotency_key) DO NOTHING RETURNING id,evidence_hash`,
    [
      site.client_id,
      site.id,
      ctx.userId,
      JSON.stringify(input.evidence),
      hash,
      key
    ]
  )
  const row
    = saved
      ?? (await queryOneFresh<any>(
        'SELECT id,evidence_hash FROM gtm_tracking_ownership_evidence WHERE recorded_by=$1 AND idempotency_key=$2',
        [ctx.userId, key]
      ))
  if (!row || row.evidence_hash !== hash)
    throw createError({
      statusCode: 409,
      statusMessage: 'Idempotency key already used'
    })
  return {
    id: row.id,
    siteId: site.id,
    clientId: site.client_id,
    evidenceHash: hash
  }
}
export async function getGtmOwnership(
  ctx: ToolContext,
  siteId: string,
  id?: string
) {
  const site = await assertGtmSite(ctx, siteId)
  const row = await queryOneFresh<any>(
    `SELECT id,evidence,evidence_hash,created_at,expires_at FROM gtm_tracking_ownership_evidence WHERE site_id=$1 AND client_id=$2 AND ($3::uuid IS NULL OR id=$3) AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1`,
    [siteId, site.client_id, id ?? null]
  )
  if (!row)
    throw createError({
      statusCode: 409,
      statusMessage: 'Current tracking ownership evidence required'
    })
  const evidence = GtmOwnershipSchema.parse(row.evidence)
  if (!site.allowed_origins.includes(`https://${evidence.publicHost}`))
    throw createError({
      statusCode: 409,
      statusMessage: 'Tracking host changed'
    })
  return { ...row, evidence }
}
