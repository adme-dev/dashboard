import { z } from 'zod'
import { CustomerPreviewApprovalSchema } from './customerDashboard'

const prefix = 'PAGE_STUDIO_CUSTOMER_'
const fields = { previewEnabled: 'PREVIEW_ENABLED', previewApprovals: 'PREVIEW_APPROVALS',
  cmsSetupEnabled: 'CMS_SETUP_ENABLED', browserEnabled: 'BROWSER_ENABLED', editorEnabled: 'EDITOR_ENABLED' } as const
const Approvals = z.array(CustomerPreviewApprovalSchema).max(100)
  .refine(rows => new Set(rows.map(row => row.workspaceId)).size === rows.length)
const Activation = z.object({ previewEnabled: z.boolean(), previewApprovals: Approvals,
  cmsSetupEnabled: z.boolean(), browserEnabled: z.boolean(), editorEnabled: z.boolean() }).strict()

/** A present bundle is atomic. Never recover fields from legacy configuration.
 * Co-configured scalar keys are rejected, even when their values agree. */
export function readCustomerActivation(env: Record<string, unknown>): z.infer<typeof Activation> {
  const closed = { previewEnabled: false, previewApprovals: [], cmsSetupEnabled: false, browserEnabled: false, editorEnabled: false }
  const key = `${prefix}ACTIVATION`
  const source = Object.hasOwn(env, key) ? env : process.env
  if (Object.hasOwn(source, key)) {
    try {
      if (typeof source[key] !== 'string' || Object.values(fields).some(name => Object.hasOwn(source, prefix + name) || Object.hasOwn(env, prefix + name))) return closed
      return Activation.parse(JSON.parse(source[key]))
    } catch { return closed }
  }
  const setting = (name: keyof typeof fields) => Object.hasOwn(env, prefix + fields[name]) ? env[prefix + fields[name]] : process.env[prefix + fields[name]]
  const legacy = { ...closed, previewEnabled: setting('previewEnabled') === 'true',
    cmsSetupEnabled: setting('cmsSetupEnabled') === 'true', browserEnabled: setting('browserEnabled') === 'true', editorEnabled: setting('editorEnabled') === 'true' }
  try {
    return { ...legacy, previewApprovals: Approvals.parse(JSON.parse(String(setting('previewApprovals') ?? '[]'))) }
  } catch { return { ...legacy, previewEnabled: false } }
}
