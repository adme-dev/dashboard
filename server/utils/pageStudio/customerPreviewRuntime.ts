import { CustomerEditorOriginSchema } from './customerEditorToken'

const keys = ['RUNTIME_ENABLED', 'PROVISIONER', 'CONTENT_ROUTER', 'CHECKPOINTS', 'EDITOR_ORIGIN']
  .map(key => `PAGE_STUDIO_CUSTOMER_PREVIEW_${key}`)
export const hasCustomerPreviewRuntimeConfiguration = (env: Record<string, unknown>) => keys.some(key => Object.hasOwn(env, key))
const method = (value: unknown, name: string) => typeof (value as Record<string, unknown> | undefined)?.[name] === 'function'

/** Fixed configuration only: callers must still resolve native authority before
 * any effect. A partially configured source must never reach shared staging. */
export function customerPreviewRuntimeEnvironment(env: Record<string, unknown>): Record<string, unknown> | null {
  if (!hasCustomerPreviewRuntimeConfiguration(env)) {
    return env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT === 'staging' && (env.PAGE_STUDIO_CONTENT_ENVIRONMENT === undefined || env.PAGE_STUDIO_CONTENT_ENVIRONMENT === 'staging') ? env : null
  }
  if (env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED !== 'true'
    || !method(env.PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER, 'createProvisioning')
    || !method(env.PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER, 'readProvisioning')
    || !method(env.PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER, 'readManagedCmsTarget')
    || !method(env.PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS, 'get')
    || !CustomerEditorOriginSchema.safeParse(env.PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN).success) return null
  return { ...env, PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging',
    PAGE_STUDIO_PROVISIONER: env.PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER,
    PAGE_STUDIO_CONTENT_ROUTER: env.PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER,
    PAGE_STUDIO_CHECKPOINTS: env.PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS,
    PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN: env.PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN }
}
