import { z } from 'zod'
import { DomainManagementActorSchema } from './domainManagement'

const SiteId = z.string().uuid().transform(value => value.toLowerCase())
const Digest = z.string().regex(/^[a-f0-9]{64}$/)
export const PageStudioStagingUpdateSchema = z.object({
  digest: Digest, expectedActiveId: z.string().uuid().nullable(), idempotencyKey: z.string().uuid()
}).strict()
const ManagementScope = { actor: DomainManagementActorSchema, siteId: SiteId, expectedEnvironment: z.enum(['staging', 'production']) }
export const PageStudioStagingRequestSchema = z.discriminatedUnion('operation', [
  z.object({ ...ManagementScope, operation: z.literal('read') }).strict(),
  z.object({ ...ManagementScope, operation: z.literal('ensure') }).strict(),
  z.object({ ...ManagementScope, operation: z.literal('update'), body: PageStudioStagingUpdateSchema }).strict()
])

/** This is an allocated name, not evidence that DNS, TLS or a build is ready.
 * Full immutable site identity avoids collisions and survives client renames.
 * Hostnames are never accepted from a visitor or from editable site content. */
export function pageStudioStagingAddress(siteId: string) {
  const identity = SiteId.parse(siteId).replaceAll('-', '')
  const hostname = `preview-${identity}.xeroflow.io`
  return { hostname, url: `https://${hostname}/` }
}

export const PageStudioStagingSnapshotSchema = z.object({
  id: z.string().uuid(),
  checkpointId: z.string().min(1).max(128),
  digest: Digest,
  deployedAt: z.string().datetime()
}).strict()

export const PageStudioStagingStateSchema = z.object({
  siteId: SiteId,
  hostname: z.string().min(1).max(253),
  url: z.string().max(300),
  status: z.enum(['not_published', 'provisioning', 'building', 'ready', 'update_failed', 'failed', 'suspended']),
  canManage: z.boolean(),
  active: PageStudioStagingSnapshotSchema.nullable(),
  currentDigest: Digest.nullable(),
  // Only fixed, visitor-safe failure categories cross the boundary.
  failure: z.enum(['HOST_UNAVAILABLE', 'BUILD_FAILED', 'SNAPSHOT_CHANGED', 'ACCESS_INACTIVE']).nullable()
}).strict().superRefine((value, ctx) => {
  const address = pageStudioStagingAddress(value.siteId)
  if (value.hostname !== address.hostname || value.url !== address.url) {
    ctx.addIssue({ code: 'custom', message: 'Staging address does not match this website' })
  }
  const activeAllowed = ['ready', 'building', 'update_failed'].includes(value.status)
  if ((!activeAllowed && value.active) || (['ready', 'update_failed'].includes(value.status) && !value.active)) {
    ctx.addIssue({ code: 'custom', message: 'Staging snapshot does not match deployment state' })
  }
})

export type PageStudioStagingState = z.infer<typeof PageStudioStagingStateSchema>

/** Render links only for a verified same-site deployment. A failed replacement
 * can keep its previous snapshot available; provisioning alone never can. */
export function pageStudioStagingLink(input: unknown, expectedSiteId: string): string | null {
  const expected = SiteId.safeParse(expectedSiteId)
  const parsed = PageStudioStagingStateSchema.safeParse(input)
  return expected.success && parsed.success && parsed.data.siteId === expected.data && parsed.data.active
    ? parsed.data.url
    : null
}
