// Exact deterministic mirror of Studio's typed draft-history planner. No authority.
import { z } from 'zod'
import { collectionCanonical as canonicalJson, collectionDigest } from './collectionApi'
import { CmsStorageTargetSchema, ReleaseScopedIdSchema, ReleaseSha256Schema } from './cmsManaged'
import { PageStudioContentScopeSchema as ContentScopeSchema } from './businessContent'
import { EmailTemplateRecordSchema } from './emailTemplates'
import { FormRecipientsRecordSchema } from './formRecipients'
import { FormSettingsRecordSchema } from './formSettings'

export const FormDraftHistoryEntrySchema = z.object({
  table: z.enum(['form_settings_drafts', 'shared_form_settings_drafts', 'form_recipients_drafts', 'email_template_drafts']),
  identity: z.array(z.string().min(1).max(128)).max(2), revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  payload: z.string().min(1).max(524288), digest: ReleaseSha256Schema
}).strict()
type FormDraftHistoryEntry = z.infer<typeof FormDraftHistoryEntrySchema>
const count = z.number().int().min(0).max(1000)
export const FormDraftTransferHistorySchema = z.object({ formatVersion: z.literal(1), fenceDigest: ReleaseSha256Schema,
  digest: ReleaseSha256Schema, counts: z.object({ form_settings_drafts: count, shared_form_settings_drafts: count,
    form_recipients_drafts: count, email_template_drafts: count }).strict(), entries: z.array(FormDraftHistoryEntrySchema).max(1000) }).strict()
const tables = [
  'form_settings_drafts',
  'shared_form_settings_drafts',
  'form_recipients_drafts',
  'email_template_drafts'
] as const
const endpoint = z
  .object({ scope: ContentScopeSchema, target: CmsStorageTargetSchema })
  .strict()
export const FormDraftHistoryTransferIntentSchema = z
  .object({
    destination: endpoint,
    formatVersion: z.literal(1),
    nativeIntentDigest: ReleaseSha256Schema,
    source: endpoint.extend({ fenceDigest: ReleaseSha256Schema }).strict(),
    transferId: ReleaseScopedIdSchema
  })
  .strict()
const History = FormDraftTransferHistorySchema
const invalid = () =>
  new Error('Draft history transfer evidence is invalid or incomplete')
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b)
function addPayloadBytes(payload: string, total: number) {
  const size = new TextEncoder().encode(payload).byteLength
  if (size > 524_288 || total + size > 8_388_608) {
    throw invalid()
  }
  return total + size
}

function recordFor(entry: FormDraftHistoryEntry) {
  const record = JSON.parse(entry.payload)
  let identity: unknown[]
  switch (entry.table) {
    case 'form_settings_drafts':
      FormSettingsRecordSchema.parse(record)
      identity = [record.pageId, record.formId]
      break
    case 'shared_form_settings_drafts':
      FormSettingsRecordSchema.parse(record)
      identity = [record.definitionId]
      break
    case 'form_recipients_drafts':
      FormRecipientsRecordSchema.parse(record)
      identity = []
      break
    case 'email_template_drafts':
      EmailTemplateRecordSchema.parse(record)
      identity = [record.audience]
      break
    default:
      throw invalid()
  }
  if (!same(identity, entry.identity) || record.revision !== entry.revision) {
    throw invalid()
  }
  return record as Record<string, unknown>
}

function validateEndpoints(
  intent: z.infer<typeof FormDraftHistoryTransferIntentSchema>
) {
  const { source, destination } = intent
  if (
    source.scope.environment === 'production'
    || destination.scope.environment !== 'production'
    || !same({ ...source.scope, environment: 'production' }, destination.scope)
    || source.target.accountId !== destination.target.accountId
    || source.target.databaseId === destination.target.databaseId
    || source.target.name === destination.target.name
    || source.target.routeId === destination.target.routeId
  ) {
    throw invalid()
  }
}

/** Deterministic preparation only: hashes do not establish native authority or
 * prove that an inventory came from storage. The importer must independently
 * reread the frozen source, verify its target, and retain this complete identity.
 * Only environment changes; original authors/checkpoints remain provenance.
 */
export async function planFormDraftHistoryTransfer(
  intentInput: unknown,
  historyInput: unknown
) {
  // Zod owns the entire bounded input before the first asynchronous operation.
  const intent = FormDraftHistoryTransferIntentSchema.parse(intentInput)
  const history = History.parse(historyInput)
  validateEndpoints(intent)
  if (history.fenceDigest !== intent.source.fenceDigest) {
    throw invalid()
  }
  let bytes = 0
  for (const entry of history.entries) {
    bytes = addPayloadBytes(entry.payload, bytes)
  }
  const { digest: historyDigest, ...historyBody } = history
  if ((await collectionDigest(historyBody)) !== historyDigest) {
    throw invalid()
  }
  const counts = {
    email_template_drafts: 0,
    form_recipients_drafts: 0,
    form_settings_drafts: 0,
    shared_form_settings_drafts: 0
  }
  const entries: {
    destination: FormDraftHistoryEntry
    sourceDigest: string
  }[] = []
  let previousTable = -1
  let previousIdentity = ''
  let previousRevision = 0
  let destinationBytes = 0
  for (const entry of history.entries) {
    const index = tables.indexOf(entry.table)
    const identity = canonicalJson(entry.identity)
    const continued = index === previousTable && identity === previousIdentity
    if (
      index < previousTable
      || (index === previousTable && identity < previousIdentity)
      || entry.revision !== (continued ? previousRevision + 1 : 1)
    ) {
      throw invalid()
    }
    previousTable = index
    previousIdentity = identity
    previousRevision = entry.revision
    const { digest: sourceDigest, ...sourceBody } = entry
    // biome-ignore lint/performance/noAwaitInLoops: ordered bounded history validation preserves revision sequence.
    if ((await collectionDigest(sourceBody)) !== sourceDigest) {
      throw invalid()
    }
    const record = recordFor(entry)
    if (!same(record.scope, intent.source.scope)) {
      throw invalid()
    }
    const destinationBody = {
      ...sourceBody,
      payload: canonicalJson({ ...record, scope: intent.destination.scope })
    }
    destinationBytes = addPayloadBytes(
      destinationBody.payload,
      destinationBytes
    )
    const digest = await collectionDigest(destinationBody)
    entries.push({ destination: { ...destinationBody, digest }, sourceDigest })
    counts[entry.table] += 1
  }
  if (!same(counts, history.counts)) {
    throw invalid()
  }
  const body = {
    ...intent,
    counts,
    entries,
    source: { ...intent.source, historyDigest }
  }
  return { ...body, digest: await collectionDigest(body) }
}

/** Retained expectation only; the destination inspector must read actual rows. */
export async function expectedFormDraftHistoryImportReceipt(plan: Awaited<ReturnType<typeof planFormDraftHistoryTransfer>>) {
  const identity = { destination: plan.destination, formatVersion: 1 as const, nativeIntentDigest: plan.nativeIntentDigest,
    planDigest: plan.digest, source: plan.source, transferId: plan.transferId }
  const body = { ...identity, destinationHistoryDigest: await collectionDigest({ formatVersion: 1,
    fenceDigest: plan.source.fenceDigest, counts: plan.counts, entries: plan.entries.map(entry => entry.destination) }),
  importIdentityDigest: await collectionDigest(identity) }
  return { ...body, digest: await collectionDigest(body) }
}
