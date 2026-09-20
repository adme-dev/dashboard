import { z } from 'zod'
import { ContentAttachmentRequestSchema } from './content-attachment'

// Reviewed first-generation catalogues. Keep aligned with Studio's private
// workflow-upgrade operation; a contract is not a permission grant.
export const WorkflowUpgradeOperationSchema = z.object({
  version: z.literal(1),
  policyVersion: z.literal('workflow-upgrade-v1'),
  collectionOperationId: ContentAttachmentRequestSchema.shape.operationId,
  operationId: ContentAttachmentRequestSchema.shape.operationId,
  scope: ContentAttachmentRequestSchema.shape.scope,
  actor: ContentAttachmentRequestSchema.shape.actor,
  accountId: z.string().regex(/^[a-f0-9]{32}$/),
  databaseId: z.string().uuid(),
  name: z.string().regex(/^ps-content-[a-f0-9]{32}$/),
  sourceDigest: z.literal('0feb591f4c5fcb82c9b10204f7e387e83b4eb52eb634ce772f8cad8716ca0cee'),
  targetDigest: z.literal('60631223175cb7e8bf9dca5b08347a192844b8600bd8687e1caa8b60c9f337ae')
}).strict()
export type WorkflowUpgradeOperation = z.infer<typeof WorkflowUpgradeOperationSchema>
export const WorkflowUpgradeDatabaseSchema = WorkflowUpgradeOperationSchema.pick({ collectionOperationId: true, accountId: true, databaseId: true, name: true, scope: true })

function canonical(value: unknown): string {
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`
}
export async function workflowUpgradeIdentity(input: unknown) {
  const request = WorkflowUpgradeOperationSchema.parse(input)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(request)))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
