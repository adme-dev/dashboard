import { transactionWithoutRetry } from '~~/server/utils/db'
import type { RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
import { prepareCustomerTransferRecoverySourceFreeze } from './customerTransferRecoverySourceFreeze'
import { executeCustomerTransferRecoverySourceFreeze } from './customerTransferRecoverySourceFreezeControl'
import { captureRecoveryRpc } from './recoveryPrivateRpc'
import { reviewDenied } from './customerTransferRecoveryCurrentAuthority'

type Dependencies = {
  env: Record<string, unknown>
  freezeDescriptor: unknown
  runTransaction?: RunPageStudioTransaction
}

/** Trusted server binding only. The descriptor is host policy, never request
 * data. Preparation and execution remain separately requested operations. */
function nativeFreezeCapabilities(d: Dependencies, executing: boolean) {
  const env = d.env, runner = d.runTransaction, freezeDescriptor = d.freezeDescriptor
  const service = env.PAGE_STUDIO_PROVISIONER as Record<string, unknown> | undefined
  const ready = captureRecoveryRpc(service, 'inspectManagedTransferRecoverySourceReady')
  const freeze = executing ? captureRecoveryRpc(service, 'executeManagedTransferRecoverySourceFreeze') : null
  const current = () => {
    ready?.assertCurrent()
    freeze?.assertCurrent()
    if (d.env !== env || d.runTransaction !== runner || d.freezeDescriptor !== freezeDescriptor
      || env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production'
      || env.PAGE_STUDIO_PROVISIONER !== service || !ready || (executing && !freeze)) throw reviewDenied()
  }
  current()
  const runTransaction: RunPageStudioTransaction = work => (runner ?? transactionWithoutRetry)(async (db) => {
    current()
    const result = await work(db)
    current()
    return result
  })
  const call = async (capability: typeof ready, input: unknown) => {
    current()
    if (!capability) throw reviewDenied()
    const result = await capability.call(structuredClone(input))
    current()
    return result
  }
  return { current, dependencies: { env, freezeDescriptor, runTransaction,
    readReady: (input: unknown) => call(ready, input),
    executeFreeze: (input: unknown) => call(freeze, input) } }
}

export async function prepareNativeCustomerTransferRecoverySourceFreeze(input: unknown, d: Dependencies) {
  const captured = nativeFreezeCapabilities(d, false)
  const result = await prepareCustomerTransferRecoverySourceFreeze(input, captured.dependencies)
  captured.current()
  return result
}

export async function executeNativeCustomerTransferRecoverySourceFreeze(input: unknown, d: Dependencies) {
  const captured = nativeFreezeCapabilities(d, true)
  const result = await executeCustomerTransferRecoverySourceFreeze(input, captured.dependencies)
  captured.current()
  return result
}
