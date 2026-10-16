import { createError } from 'h3'
import { z } from 'zod'
import { collectionCanonical as canonical } from '~~/shared/pageStudio/collectionApi'
import { CompletedManagedTransferStatusSchema as Status, CompletedManagedTransferManagementRequestSchema as Wire } from '~~/shared/pageStudio/completed-managed-transfer-management'
import { ManagedTransferDestinationAuthoringRequestSchema as AuthoringRequest, requireMatchingManagedTransferDestinationAuthoringStatus as matchAuthoringStatus } from '~~/shared/pageStudio/managed-transfer-destination-authoring'
import type { RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
import { capturePageStudioRpcMethod } from '~~/server/utils/pageStudio/privateRpc'
import { readManagedTransferDestinationAuthoring, withCurrentCompletedManagedTransferAuthority } from './managedTransferDestinationAuthoring'
import { coordinateManagedTransferSourceRetention } from './managedTransferSourceRetention'

type Dependencies = {
  env: Record<string, unknown>
  runTransaction?: RunPageStudioTransaction
}
const Input = Wire.omit({ expectedEnvironment: true })
const Retention = z.object({ operationId: z.uuid(), state: z.enum(['retention-pending', 'retained']) }).strict()
const conflict = () => createError({ statusCode: 409, statusMessage: 'The completed transfer or current authoring destination changed.' })
/** Current native authority is refreshed outside every RPC. Status never installs
 * or retains; explicit actions write once only after a verified pending read. */
export async function coordinateCompletedManagedTransfer(input: unknown, dependencies: Dependencies) {
  const request = Input.parse(input), { siteId, action } = request
  const service = dependencies.env.PAGE_STUDIO_PROVISIONER as Record<string, unknown> | undefined
  const read = capturePageStudioRpcMethod(service, 'readManagedTransferDestinationAuthoring')
  const install = capturePageStudioRpcMethod(service, 'installManagedTransferDestinationAuthoring')
  const current = () => withCurrentCompletedManagedTransferAuthority({ siteId }, async (_db, { completion }) => completion, dependencies)
  const original = await current()
  const guard = async () => {
    if (canonical(await current()) !== canonical(original))
      throw conflict()
  }
  // Only work errors become unavailable. Failed authority checks always abort the
  // whole operation, and observed objects are owned before the next callback.
  const observe = async (work: () => Promise<unknown>) => {
    await guard()
    let observed: {
      ok: true
      value: unknown
    } | {
      ok: false
    }
    try {
      observed = { ok: true, value: structuredClone(await work()) }
    } catch {
      observed = { ok: false }
    }
    await guard()
    return observed
  }
  const authoring = async (mode: 'read' | 'install') => {
    const admission = await observe(() => readManagedTransferDestinationAuthoring({ siteId }, dependencies))
    if (!admission.ok)
      return null
    const parsed = AuthoringRequest.safeParse(admission.value)
    if (!parsed.success || canonical(parsed.data.completionReceipt) !== canonical(original))
      return null
    const remote = mode === 'install' ? install : read
    if (!remote)
      return null
    const observed = await observe(() => remote(structuredClone(parsed.data)))
    const after = await observe(() => readManagedTransferDestinationAuthoring({ siteId }, dependencies))
    if (!observed.ok || !after.ok || canonical(after.value) !== canonical(parsed.data))
      return null
    try {
      return await matchAuthoringStatus(observed.value, parsed.data)
    } catch {
      return null
    }
  }
  let editor = await authoring('read')
  if (action === 'connect' && editor?.state === 'not-started')
    editor = await authoring('install')
  const editorConnection = editor?.state === 'ready' ? 'ready' : editor?.state === 'not-started' ? 'pending' : 'unavailable'
  const reference = { operationId: original.operationId, intentDigest: original.intentDigest }
  const retention = async (retain: boolean) => {
    const observed = await observe(() => coordinateManagedTransferSourceRetention({ ...reference, action: retain ? 'retain' : 'status' }, dependencies))
    if (!observed.ok)
      return null
    const parsed = Retention.safeParse(observed.value)
    return parsed.success && parsed.data.operationId === reference.operationId ? parsed.data : null
  }
  let source = await retention(false)
  if (action === 'retain' && source?.state === 'retention-pending') {
    source = await retention(true)
    // An uncertain acknowledgement permits only this read-only recovery. Never
    // issue another write from status, catch handling or a response timeout.
    if (!source)
      source = await retention(false)
  }
  const sourceRetention = source?.state === 'retained' ? 'retained' : source?.state === 'retention-pending' ? 'pending' : 'unavailable'
  await guard()
  return Status.parse({ siteId, completed: true, editorConnection, sourceRetention, canRetryConnection: editorConnection === 'pending', canRetryRetention: sourceRetention === 'pending' })
}
