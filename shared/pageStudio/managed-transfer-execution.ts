// Wire mirror of Studio managed-transfer-execution protocol. No authority.
import { z } from 'zod'
import { PageStudioContentScopeSchema as ContentScopeSchema } from './businessContent'
import { contentScopeKey, CmsFreezeReceiptSchema, CmsStorageTargetSchema, ReleaseSha256Schema } from './cmsManaged'
import { FormDraftsUpgradeReceiptSchema } from './form-drafts-upgrade'
import { collectionCanonical as canonicalJson } from './collectionApi'

/** Immutable physical execution identity; this schema grants no authority. */
export const DispatchWorkerIntentSchema = z.object({
  accountId: z.string().regex(/^[a-f0-9]{32}$/), compatibilityDate: z.iso.date(), databaseId: z.uuid(),
  namespace: z.enum(['xeroflow-page-studio-dispatch-staging', 'xeroflow-page-studio-dispatch-production']),
  ownerTag: z.string().regex(/^ps-owner-[a-f0-9]{32}$/), runtimeDigest: ReleaseSha256Schema,
  scope: ContentScopeSchema, scriptName: z.string().regex(/^ps-content-[a-f0-9]{32}$/), setupDigest: ReleaseSha256Schema
}).strict()
const Runtime = z.object({ compatibilityDate: z.iso.date(), digest: ReleaseSha256Schema }).strict()
export const ManagedTransferExecutionPolicySchema = z.object({ version: z.literal(1), kind: z.literal('managed-draft-transfer'), formReceiptDigest: ReleaseSha256Schema, from: Runtime, to: Runtime }).strict()
/** Exact request retained by native before any provider action. Staging source
 * ownership stays intact; only the private production coordinator may execute. */
export const ManagedTransferExecutionRequestSchema = z.object({ formatVersion: z.literal(1), operationId: z.uuid(), intentDigest: ReleaseSha256Schema,
  sourceScope: ContentScopeSchema, sourceTarget: CmsStorageTargetSchema, freeze: CmsFreezeReceiptSchema,
  formReceipt: FormDraftsUpgradeReceiptSchema, policy: ManagedTransferExecutionPolicySchema,
  predecessor: DispatchWorkerIntentSchema, successor: DispatchWorkerIntentSchema
}).strict().superRefine((r, ctx) => {
  const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b)
  if (r.sourceScope.environment !== 'staging' || r.predecessor.namespace !== 'xeroflow-page-studio-dispatch-staging'
    || !same(r.freeze.request.scope, r.sourceScope) || !same(r.freeze.request.target, r.sourceTarget)
    || !same(r.formReceipt.scope, r.sourceScope) || r.formReceipt.databaseId !== r.sourceTarget.databaseId || r.formReceipt.accountId !== r.sourceTarget.accountId || r.formReceipt.name !== r.sourceTarget.name
    || contentScopeKey(r.predecessor.scope) !== contentScopeKey(r.sourceScope) || r.predecessor.accountId !== r.sourceTarget.accountId || r.predecessor.databaseId !== r.sourceTarget.databaseId || r.predecessor.runtimeDigest !== r.sourceTarget.runtimeDigest
    || !same({ ...r.successor, compatibilityDate: r.predecessor.compatibilityDate, ownerTag: r.predecessor.ownerTag, runtimeDigest: r.predecessor.runtimeDigest, scriptName: r.predecessor.scriptName }, r.predecessor)
    || r.successor.ownerTag === r.predecessor.ownerTag || r.successor.scriptName === r.predecessor.scriptName || r.successor.runtimeDigest === r.predecessor.runtimeDigest
    || !same(r.policy.from, { compatibilityDate: r.predecessor.compatibilityDate, digest: r.predecessor.runtimeDigest }) || !same(r.policy.to, { compatibilityDate: r.successor.compatibilityDate, digest: r.successor.runtimeDigest })) {
    ctx.addIssue({ code: 'custom', message: 'Managed transfer execution identity mismatch' })
  }
})
export type ManagedTransferExecutionRequest = z.infer<typeof ManagedTransferExecutionRequestSchema>
export const ManagedTransferExecutionStatusSchema = z.object({ operationId: z.uuid(), intentDigest: ReleaseSha256Schema, state: z.enum(['not-started', 'resume-required', 'pending', 'ready', 'disabled']), identity: ReleaseSha256Schema.optional() }).strict()

export const ManagedTransferExecutionReferenceSchema = z.object({ operationId: z.uuid(), intentDigest: ReleaseSha256Schema }).strict()
export const ManagedTransferExecutionContextSchema = ManagedTransferExecutionReferenceSchema.extend({ formatVersion: z.literal(1), sourceScope: ContentScopeSchema, sourceTarget: CmsStorageTargetSchema, freezeDigest: ReleaseSha256Schema }).strict().refine(r => r.sourceScope.environment === 'staging', 'Managed transfer source must be staging')
export const ManagedTransferExecutionDiscoverySchema = ManagedTransferExecutionContextSchema.safeExtend({ predecessor: DispatchWorkerIntentSchema, freeze: CmsFreezeReceiptSchema, formReceipt: FormDraftsUpgradeReceiptSchema }).strict()
