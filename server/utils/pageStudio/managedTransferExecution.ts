import { capturePageStudioRpcMethod } from './privateRpc'
import { createError } from 'h3'
import { z } from 'zod'
import { collectionCanonical as canonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { ManagedTransferExecutionContextSchema as Context, ManagedTransferExecutionDiscoverySchema as Discovery,
  ManagedTransferExecutionRequestSchema as Request, ManagedTransferExecutionStatusSchema as Progress, ManagedTransferExecutionPolicySchema } from '~~/shared/pageStudio/managed-transfer-execution'
import { ManagedTransferReferenceSchema as Reference, withReservedManagedTransfer } from './managedTransferIntent'
import { ManagedTransferResourceBindingSchema } from './managedTransferResources'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

type Dependencies = { runTransaction?: RunPageStudioTransaction }
type Intent = Parameters<Parameters<typeof withReservedManagedTransfer>[1]>[1]
interface Row { request: unknown, request_digest: string }
const denied = () => createError({ statusCode: 403, statusMessage: 'Managed transfer execution access denied' })
const conflict = () => createError({ statusCode: 409, statusMessage: 'Managed transfer execution changed. Resume the original operation.' })
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Reviewed transfer execution configuration is unavailable' })
const Configuration = ManagedTransferExecutionPolicySchema.omit({ formReceiptDigest: true }).extend({
  accountId: z.string().regex(/^[a-f0-9]{32}$/), namespace: z.literal('xeroflow-page-studio-dispatch-staging')
}).strict()

async function context(db: PageStudioQueryClient, intent: Intent) {
  const row = (await db.query<{ binding: unknown, binding_digest: string }>(
    'SELECT binding,binding_digest FROM page_studio_managed_transfer_resource_bindings WHERE operation_id=$1', [intent.operationId])).rows[0]
  const binding = ManagedTransferResourceBindingSchema.safeParse(row?.binding)
  if (!row || !binding.success || await collectionDigest(binding.data) !== row.binding_digest
    || binding.data.operationId !== intent.operationId || binding.data.intentDigest !== await collectionDigest(intent)
    || binding.data.destinationGeneration !== intent.destination.generation) throw conflict()
  return Context.parse({ formatVersion: 1, operationId: intent.operationId, intentDigest: binding.data.intentDigest,
    sourceScope: intent.authority.source, sourceTarget: intent.source.context.state.target,
    freezeDigest: intent.source.context.state.freeze_digest })
}
async function retained(db: PageStudioQueryClient, expected: z.infer<typeof Context>) {
  const row = (await db.query<Row>('SELECT request,request_digest FROM page_studio_managed_transfer_executions WHERE operation_id=$1', [expected.operationId])).rows[0]
  if (!row) return null
  const parsed = Request.safeParse(row.request)
  if (!parsed.success || await collectionDigest(parsed.data) !== row.request_digest) throw denied()
  await match(parsed.data, expected)
  return parsed.data
}
/** Internal transaction helper; caller must hold original transfer authority. */
export async function retainedManagedTransferExecution(db: PageStudioQueryClient, intent: Intent) {
  return retained(db, await context(db, intent))
}
async function match(request: z.infer<typeof Request>, expected: z.infer<typeof Context>) {
  if (request.operationId !== expected.operationId || request.intentDigest !== expected.intentDigest
    || canonical(request.sourceScope) !== canonical(expected.sourceScope) || canonical(request.sourceTarget) !== canonical(expected.sourceTarget)
    || request.freeze.digest !== expected.freezeDigest) throw conflict()
  const { digest, ...body } = request.freeze
  if (await collectionDigest(body) !== digest || await collectionDigest(request.formReceipt) !== request.policy.formReceiptDigest) throw conflict()
}

/** Private discovery admission. Returns only original source identity, never a
 * credential or permission to mutate. Destination resources must already bind. */
export async function readManagedTransferExecutionContext(input: unknown, dependencies: Dependencies = {}) {
  return withReservedManagedTransfer(input, context, dependencies)
}

/** Reserve the exact successor before remote effects. Discovery is trusted and
 * read-only; it runs outside native locks, then original authority/source are
 * checked again. This does not upload/install, select a route or publish. */
export async function prepareManagedTransferExecution(input: unknown, dependencies: Dependencies & { env: Record<string, unknown> }) {
  const parsed = Reference.safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid managed transfer reference' })
  if (dependencies.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') throw unavailable()
  let config: z.infer<typeof Configuration>
  try {
    config = Configuration.parse(JSON.parse(String(dependencies.env.MANAGED_TRANSFER_EXECUTION_POLICY)))
  } catch {
    throw unavailable()
  }
  const options = { runTransaction: dependencies.runTransaction }, reference = parsed.data
  const service = dependencies.env.PAGE_STUDIO_PROVISIONER as { discoverManagedTransferExecution?: (input: unknown) => Promise<unknown> } | undefined
  const discover = capturePageStudioRpcMethod(service, 'discoverManagedTransferExecution')
  const inspect = async (db: PageStudioQueryClient, intent: Intent) => {
    const source = await context(db, intent)
    const saved = await retained(db, source)
    if (config.accountId !== source.sourceTarget.accountId || config.from.digest !== source.sourceTarget.runtimeDigest) throw conflict()
    if (saved && (canonical(saved.policy.from) !== canonical(config.from) || canonical(saved.policy.to) !== canonical(config.to))) throw conflict()
    return { source, saved }
  }
  const before = await withReservedManagedTransfer(reference, inspect, options)
  const result = { operationId: reference.operationId, state: 'execution-reserved' as const }
  if (before.saved) return result
  if (!discover) throw unavailable()
  const observed = Discovery.safeParse(await discover(structuredClone(reference)))
  if (!observed.success) throw conflict()
  const { predecessor, freeze, formReceipt, ...source } = observed.data
  if (canonical(source) !== canonical(before.source)) throw conflict()
  const policy = { version: config.version, kind: config.kind, from: config.from, to: config.to, formReceiptDigest: await collectionDigest(formReceipt) }
  const identity = await collectionDigest({ ...reference, predecessor, policy })
  const successor = { ...predecessor, runtimeDigest: config.to.digest, compatibilityDate: config.to.compatibilityDate,
    scriptName: `ps-content-${identity.slice(0, 32)}`, ownerTag: `ps-owner-${(await collectionDigest({ identity, purpose: 'owner' })).slice(0, 32)}` }
  const candidate = Request.safeParse({ formatVersion: 1, ...reference, sourceScope: source.sourceScope, sourceTarget: source.sourceTarget,
    predecessor, successor, freeze, formReceipt, policy })
  if (!candidate.success) throw conflict()
  const request = candidate.data
  await match(request, before.source)
  return withReservedManagedTransfer(reference, async (db, intent) => {
    const current = await inspect(db, intent)
    if (canonical(current.source) !== canonical(before.source) || (current.saved && canonical(current.saved) !== canonical(request))) throw conflict()
    if (!current.saved) {
      try {
        await db.query(`INSERT INTO page_studio_managed_transfer_executions(operation_id,intent_digest,request,request_digest,account_id,namespace,script_name)
          VALUES($1,$2,$3::jsonb,$4,$5,$6,$7)`, [reference.operationId, reference.intentDigest, JSON.stringify(request), await collectionDigest(request),
          request.successor.accountId, request.successor.namespace, request.successor.scriptName])
      } catch (error) {
        if ((error as { code?: string })?.code === '23505') throw conflict()
        throw error
      }
    }
    return result
  }, options)
}

/** Private executor callback: the full request is retained natively before any
 * upload, schema install or successor routing. Original sessions cannot renew. */
export async function authorizeManagedTransferExecution(input: unknown, dependencies: Dependencies = {}) {
  const parsed = Request.safeParse(input)
  if (!parsed.success) throw denied()
  const request = parsed.data
  return withReservedManagedTransfer({ operationId: request.operationId, intentDigest: request.intentDigest }, async (db, intent) => {
    const saved = await retained(db, await context(db, intent))
    if (!saved || canonical(saved) !== canonical(request)) throw denied()
    return saved
  }, dependencies)
}

/** Private workflow progress only. A ready execution is not a transfer receipt
 * and does not select destination content or grant customer publishing access. */
export async function coordinateManagedTransferExecution(input: unknown, dependencies: Dependencies & { env: Record<string, unknown> }) {
  const parsed = Reference.extend({ action: z.enum(['status', 'start', 'resume', 'verify']) }).strict().safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid managed transfer execution action' })
  if (dependencies.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') throw unavailable()
  const { action, ...reference } = parsed.data
  const options = { runTransaction: dependencies.runTransaction }
  const service = dependencies.env.PAGE_STUDIO_PROVISIONER as Record<string, (...args: unknown[]) => Promise<unknown>> | undefined
  const methods = { status: 'readManagedTransferExecution', verify: 'inspectManagedTransferExecution', start: 'prepareManagedTransferExecution', resume: 'prepareManagedTransferExecution' }
  const remote = capturePageStudioRpcMethod(service, methods[action])
  const read = () => withReservedManagedTransfer(reference, async (db, intent) => retained(db, await context(db, intent)), options)
  let original = await read()
  const result = (state: string) => ({ operationId: reference.operationId, state })
  if (!original && action === 'status') return result('not-started')
  if (!original && action !== 'start') throw conflict()
  if (!remote) throw unavailable()
  if (action === 'start') {
    await prepareManagedTransferExecution(reference, dependencies)
    original = await read()
  }
  if (!original) throw conflict()
  const request = structuredClone(original)
  const observed = await (action === 'start' || action === 'resume' ? remote(request, action) : remote(request))
  const progress = Progress.safeParse(observed)
  if (!progress.success || progress.data.operationId !== reference.operationId || progress.data.intentDigest !== reference.intentDigest
    || progress.data.state === 'not-started' || (progress.data.state !== 'resume-required' && !progress.data.identity)) throw conflict()
  const current = await read()
  if (canonical(current) !== canonical(original)) throw conflict()
  return result(progress.data.state)
}
