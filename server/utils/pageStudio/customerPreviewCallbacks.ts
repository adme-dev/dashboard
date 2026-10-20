import { createError } from 'h3'
import { customerPreviewRuntimeEnvironment } from './customerPreviewRuntime'
import { PageStudioProvisioningRequestSchema } from './provisioningAuthority'
import { PageStudioProvisioningJobSchema, requirePageStudioProvisioningRuntime, type PageStudioProvisionerBinding } from './provisioningBinding'
import type { SchemaUpgradeContract } from './schemaUpgradeContract'

const denied = () => createError({ statusCode: 403, statusMessage: 'Native preview runtime is unavailable.' })
/** Private machine auth must run before this selector. Only the retained job can
 * choose native authority; the downstream verifier rechecks its original login,
 * owner, approved plan and exact scope before every effect. */
export function customerProvisioningCallbackRuntime(env: Record<string, unknown>, input: unknown) {
  if (env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') return requirePageStudioProvisioningRuntime(env)
  const parsed = PageStudioProvisioningRequestSchema.safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400 })
  if (parsed.data.scope.environment !== 'staging') return requirePageStudioProvisioningRuntime(env)
  const source = customerPreviewRuntimeEnvironment(env)
  if (!source) throw denied()
  const runtime = requirePageStudioProvisioningRuntime(source)
  const binding: PageStudioProvisionerBinding = {
    createProvisioning: input => runtime.binding.createProvisioning(input),
    async readProvisioning(requestKey, scope) {
      const raw = await runtime.binding.readProvisioning!(requestKey, scope)
      if (raw === null) return null
      const job = PageStudioProvisioningJobSchema.parse(raw)
      if (job.actor?.kind !== 'customer-user' || job.scope.environment !== 'staging') throw denied()
      return job
    } }
  return { environment: runtime.environment, binding }
}
/** Shape selects only fixed configuration, never permission. The original schema
 * authority compares the retained intent and revalidates its customer session. */
export function customerSchemaCallbackEnvironment(env: Record<string, unknown>, input: unknown, contract: SchemaUpgradeContract) {
  if (env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') return requirePageStudioProvisioningRuntime(env).environment
  const parsed = contract.schema.safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400 })
  if (parsed.data.actor.kind === 'customer-user' && parsed.data.scope.environment === 'staging') {
    const source = customerPreviewRuntimeEnvironment(env)
    if (!source) throw denied()
    return requirePageStudioProvisioningRuntime(source).environment
  }
  return requirePageStudioProvisioningRuntime(env).environment
}
