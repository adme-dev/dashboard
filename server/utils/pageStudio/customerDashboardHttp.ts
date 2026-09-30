import { createError, readBody, type H3Event } from 'h3'
import { z } from 'zod'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { guardCustomerRequest, customerSessionToken, limitCustomerRequest } from './customerSignupHttp'
import { getPageStudioProvisioningRuntime } from './provisioningBinding'
import { CustomerPreviewApprovalSchema, readCustomerDashboard, createCustomerDashboardPreview, type CustomerDashboardDependencies } from './customerDashboard'

function options(event: H3Event): CustomerDashboardDependencies {
  const env = event.context.cloudflare?.env ?? {}
  const setting = (key: string) => env[key] ?? process.env[key]
  const runtime = getPageStudioProvisioningRuntime(env)
  const enabled = setting('PAGE_STUDIO_CUSTOMER_PREVIEW_ENABLED') === 'true' && runtime?.environment === 'staging'
  try {
    const approvals = z.array(CustomerPreviewApprovalSchema).max(100)
      .refine(rows => new Set(rows.map(row => row.workspaceId)).size === rows.length)
      .parse(JSON.parse(String(setting('PAGE_STUDIO_CUSTOMER_PREVIEW_APPROVALS') ?? '[]')))
    return { enabled, binding: runtime?.binding, approvals }
  } catch {
    return { enabled: false }
  }
}
function safeError(error: unknown): never {
  const status = (error as { statusCode?: number })?.statusCode
  if (status === 401) throw createError({ statusCode: 401, statusMessage: 'Sign in to continue.' })
  if (status === 403 || status === 409) throw createError({ statusCode: status, statusMessage: 'Your preview needs attention. Refresh your overview or contact support.' })
  throw createError({ statusCode: 503, statusMessage: 'We could not check your website. Refresh your overview before trying again.' })
}
export async function customerDashboardHandler(event: H3Event) {
  guardCustomerRequest(event, 'GET')
  const token = customerSessionToken(event)
  try {
    return await readCustomerDashboard(token, options(event))
  } catch (error) { safeError(error) }
}
export async function customerPreviewHandler(event: H3Event) {
  guardCustomerRequest(event, 'POST')
  const token = customerSessionToken(event)
  if (!z.object({}).strict().safeParse(await readBody(event)).success) throw createError({ statusCode: 400, statusMessage: 'Invalid preview request.' })
  const dependencies = options(event)
  if (!dependencies.enabled) throw createError({ statusCode: 403, statusMessage: 'Preview creation is not available yet.' })
  await limitCustomerRequest(event, `preview:${await digestPortalSessionToken(token)}`, 10)
  try {
    return await createCustomerDashboardPreview(token, dependencies)
  } catch (error) { safeError(error) }
}
