import { z } from 'zod'
import { ContentAttachmentRequestSchema } from './content-attachment'

// Reviewed first-generation catalogues. Keep aligned with Studio's private
// collection-upgrade operation; a contract is not a permission grant.
export const CollectionUpgradeOperationSchema = z.object({
  version: z.literal(1),
  policyVersion: z.literal('collection-upgrade-v1'),
  operationId: ContentAttachmentRequestSchema.shape.operationId,
  scope: ContentAttachmentRequestSchema.shape.scope,
  actor: ContentAttachmentRequestSchema.shape.actor,
  accountId: z.string().regex(/^[a-f0-9]{32}$/),
  databaseId: z.string().uuid(),
  name: z.string().regex(/^ps-content-[a-f0-9]{32}$/),
  sourceDigest: z.literal('012054889e832d8753033811f9a6306d0b9f90a552c9f0a0af9ec5a6f62d435a'),
  targetDigest: z.literal('0feb591f4c5fcb82c9b10204f7e387e83b4eb52eb634ce772f8cad8716ca0cee')
}).strict()
export type CollectionUpgradeOperation = z.infer<typeof CollectionUpgradeOperationSchema>
export const CollectionUpgradeDatabaseSchema = CollectionUpgradeOperationSchema.pick({ accountId: true, databaseId: true, name: true, scope: true })

function canonical(value: unknown): string {
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`
}
export async function collectionUpgradeIdentity(input: unknown) {
  const request = CollectionUpgradeOperationSchema.parse(input)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(request)))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
