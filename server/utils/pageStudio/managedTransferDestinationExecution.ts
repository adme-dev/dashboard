import { createError } from 'h3'
import { z } from 'zod'
import { collectionCanonical as canonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { ManagedTransferDestinationExecutionAuthorizationSchema as Authorization, ManagedTransferDestinationExecutionPolicySchema as Policy,
  planManagedTransferDestinationExecution, requireMatchingManagedTransferDestinationExecutionRequest as matchingRequest } from '~~/shared/pageStudio/managed-transfer-destination-execution'
import { planManagedTransferDestinationCatalogue } from '~~/shared/pageStudio/managed-transfer-destination-catalogue-result'
import { ManagedTransferReferenceSchema as Reference, withReservedManagedTransfer } from './managedTransferIntent'
import { retainedManagedTransferDestinationCatalogue } from './managedTransferDestinationCatalogue'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

type Intent = Parameters<Parameters<typeof withReservedManagedTransfer>[1]>[1]
type Dependencies = { env: Record<string, unknown>, runTransaction?: RunPageStudioTransaction }
const denied = () => createError({ statusCode: 403, statusMessage: 'Prepared destination execution access denied' })
const conflict = () => createError({ statusCode: 409, statusMessage: 'Prepared destination execution changed. Resume the original operation.' })
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Reviewed destination execution configuration is unavailable' })
const Configuration = Policy.omit({ formReceiptDigest: true }).extend({ accountId: z.string().regex(/^[a-f0-9]{32}$/),
  namespace: z.literal('xeroflow-page-studio-dispatch-production') }).strict()
function configuration(env: Record<string, unknown>) {
  if (env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') throw unavailable()
  try {
    return Configuration.parse(JSON.parse(String(env.MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY)))
  } catch {
    throw unavailable()
  }
}

/** Original transfer/site locks are held. Historical catalogue verification is
 * only a prerequisite; Studio must independently inspect current physical state. */
async function expectedRequest(db: PageStudioQueryClient, intent: Intent, config: z.infer<typeof Configuration>) {
  const current = await retainedManagedTransferDestinationCatalogue(db, intent)
  if (!current.saved) throw conflict()
  const plan = await planManagedTransferDestinationCatalogue(current.saved)
  const verified = (await db.query<{ intent_digest: string, request_digest: string, plan_digest: string, receipt: unknown, receipt_digest: string }>(
    `SELECT intent_digest,request_digest,plan_digest,receipt,receipt_digest
      FROM page_studio_managed_transfer_catalogue_verifications WHERE operation_id=$1`, [intent.operationId])).rows[0]
  if (!verified || verified.intent_digest !== plan.request.intentDigest || verified.request_digest !== plan.requestDigest
    || verified.plan_digest !== plan.planDigest || verified.receipt_digest !== plan.receipt.digest
    || canonical(verified.receipt) !== canonical(plan.receipt) || config.accountId !== plan.request.baseline.worker.accountId
    || config.namespace !== plan.request.baseline.worker.namespace) throw conflict()
  try {
    return await planManagedTransferDestinationExecution(plan.request, plan.receipt, { version: config.version, kind: config.kind,
      from: config.from, to: config.to, formReceiptDigest: plan.receiptDigests.forms })
  } catch { throw conflict() }
}
async function retainedRequest(db: PageStudioQueryClient, expected: Awaited<ReturnType<typeof expectedRequest>>) {
  const row = (await db.query<{
    intent_digest: string
    request: unknown
    request_json: string
    request_digest: string
    account_id: string
    namespace: string
    script_name: string
  }>(
    `SELECT intent_digest,request,request_json,request_digest,account_id,namespace,script_name
      FROM page_studio_managed_transfer_destination_executions WHERE operation_id=$1`, [expected.operationId])).rows[0]
  if (!row) return null
  let saved: Awaited<ReturnType<typeof matchingRequest>>
  try {
    saved = await matchingRequest(row.request)
  } catch {
    throw denied()
  }
  if (row.intent_digest !== expected.intentDigest || row.request_json !== canonical(saved) || row.request_digest !== await collectionDigest(saved)
    || row.account_id !== saved.successor.accountId || row.namespace !== saved.successor.namespace || row.script_name !== saved.successor.scriptName) throw denied()
  if (canonical(saved) !== canonical(expected)) throw conflict()
  return saved
}

/** Private save-before-effect boundary. Never calls a provider or creates a
 * freeze receipt, active route, native completion or customer selection. */
export async function prepareManagedTransferDestinationExecution(input: unknown, dependencies: Dependencies) {
  const parsed = Reference.safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid managed transfer reference' })
  const config = configuration(dependencies.env)
  return withReservedManagedTransfer(parsed.data, async (db, intent) => {
    const expected = await expectedRequest(db, intent, config)
    const saved = await retainedRequest(db, expected)
    if (!saved) {
      try {
        await db.query(`INSERT INTO page_studio_managed_transfer_destination_executions
          (operation_id,intent_digest,request,request_json,request_digest,account_id,namespace,script_name)
          VALUES($1,$2,$3::jsonb,$4,$5,$6,$7,$8)`, [expected.operationId, expected.intentDigest, canonical(expected), canonical(expected),
          await collectionDigest(expected), expected.successor.accountId, expected.successor.namespace, expected.successor.scriptName])
      } catch (error) {
        if ((error as { code?: string })?.code === '23505') throw conflict()
        throw error
      }
    }
    return structuredClone(saved ?? expected)
  }, dependencies)
}

/** Exact original machine callback. Current reviewed policy and original native
 * authority are rechecked; no replacement session or runtime is accepted. */
export async function authorizeManagedTransferDestinationExecution(input: unknown, dependencies: Dependencies) {
  const parsed = Authorization.safeParse(input)
  if (!parsed.success) throw denied()
  const auth = parsed.data, config = configuration(dependencies.env)
  try {
    await matchingRequest(auth.request)
  } catch {
    throw denied()
  }
  return withReservedManagedTransfer({ operationId: auth.request.operationId, intentDigest: auth.request.intentDigest }, async (db, intent) => {
    const expected = await expectedRequest(db, intent, config)
    const saved = await retainedRequest(db, expected)
    if (!saved || canonical(saved) !== canonical(auth.request)) throw denied()
    return auth
  }, dependencies)
}
