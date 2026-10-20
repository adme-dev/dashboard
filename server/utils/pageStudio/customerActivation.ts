import { z } from 'zod'
import { createError } from 'h3'
import { CustomerEditorOriginSchema } from './customerEditorToken'
import { CustomerPreviewApprovalSchema } from './customerDashboard'

const prefix = 'PAGE_STUDIO_CUSTOMER_'
const key = `${prefix}ACTIVATION`
const source = (env: Record<string, unknown>) => Object.hasOwn(env, key) ? env : process.env
const fields = { previewEnabled: 'PREVIEW_ENABLED', previewApprovals: 'PREVIEW_APPROVALS',
  cmsSetupEnabled: 'CMS_SETUP_ENABLED', browserEnabled: 'BROWSER_ENABLED', editorEnabled: 'EDITOR_ENABLED' } as const
const Approvals = z.array(CustomerPreviewApprovalSchema).max(100)
  .refine(rows => new Set(rows.map(row => row.workspaceId)).size === rows.length)
const Activation = z.object({ previewEnabled: z.boolean(), previewApprovals: Approvals,
  cmsSetupEnabled: z.boolean(), browserEnabled: z.boolean(), editorEnabled: z.boolean(),
  productionEditorEnabled: z.boolean().optional(), productionEditorOrigin: CustomerEditorOriginSchema.refine(value => !/[\s;*\\]/.test(value)).optional() }).strict()
  .refine(value => (value.productionEditorEnabled === undefined) === (value.productionEditorOrigin === undefined))

/** A present bundle is atomic. Never recover fields from legacy configuration.
 * Co-configured scalar keys are rejected, even when their values agree. */
export function readCustomerActivation(env: Record<string, unknown>): z.infer<typeof Activation> {
  const closed = { previewEnabled: false, previewApprovals: [], cmsSetupEnabled: false, browserEnabled: false, editorEnabled: false }
  const settings = source(env)
  if (Object.hasOwn(settings, key)) {
    try {
      if (typeof settings[key] !== 'string' || Object.values(fields).some(name => Object.hasOwn(settings, prefix + name) || Object.hasOwn(env, prefix + name))) return closed
      const value = Activation.parse(JSON.parse(settings[key]))
      if (value.productionEditorEnabled !== undefined && ['PRODUCTION_EDITOR_ENABLED', 'EDITOR_ORIGIN'].some(name => Object.hasOwn(settings, prefix + name) || Object.hasOwn(env, prefix + name))) return closed
      return value
    } catch { return closed }
  }
  const setting = (name: string) => Object.hasOwn(env, prefix + name) ? env[prefix + name] : process.env[prefix + name]
  const origin = setting('EDITOR_ORIGIN')
  const legacy = { ...closed, ...(setting('PRODUCTION_EDITOR_ENABLED') === undefined
    ? {}
    : {
        productionEditorEnabled: setting('PRODUCTION_EDITOR_ENABLED') === 'true', productionEditorOrigin: typeof origin === 'string' ? origin : undefined }), previewEnabled: setting('PREVIEW_ENABLED') === 'true',
  cmsSetupEnabled: setting('CMS_SETUP_ENABLED') === 'true', browserEnabled: setting('BROWSER_ENABLED') === 'true', editorEnabled: setting('EDITOR_ENABLED') === 'true' }
  try {
    return { ...legacy, previewApprovals: Approvals.parse(JSON.parse(String(setting('PREVIEW_APPROVALS') ?? '[]'))) }
  } catch { return { ...legacy, previewEnabled: false } }
}

/** Only verified native workspace IDs reach this deployment-scope check. It does
 * not replace ownership, the pinned plan, completion or managed storage proof. */
export function customerDestinationGuard(env: Record<string, unknown>): ((workspaceId: string, now?: number) => void) | undefined {
  if (!Object.hasOwn(source(env), key)) return undefined
  return (workspaceId, now = Date.now()) => {
    const activation = readCustomerActivation(env)
    if (!activation.browserEnabled || !activation.editorEnabled || !activation.productionEditorEnabled || !activation.previewApprovals.some(row => row.workspaceId === workspaceId && Date.parse(row.policy.expiresAt) > now)) {
      throw createError({ statusCode: 403, statusMessage: 'Customer editor access is not available.' })
    }
  }
}
