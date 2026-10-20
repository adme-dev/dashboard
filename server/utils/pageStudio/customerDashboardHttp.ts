import { createError, readBody, type H3Event } from 'h3'
import { z } from 'zod'
import { CustomerProvisioningRecoverySchema } from '~~/shared/pageStudio/customerDashboard'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { guardCustomerRequest, customerSessionToken, limitCustomerRequest } from './customerSignupHttp'
import { customerPreviewRuntimeEnvironment } from './customerPreviewRuntime'
import { getPageStudioProvisioningRuntime } from './provisioningBinding'
import { CustomerPreviewApprovalSchema, readCustomerDashboard, createCustomerDashboardPreview, recoverCustomerDashboardPreview, type CustomerDashboardDependencies } from './customerDashboard'

import { customerCmsSetupOptions } from './customerCmsSetupHttp'
import { customerCmsSetupAvailable } from './customerCmsSetup'
import { customerEditorRequestOptions } from './customerEditorLaunchHttp'
import { readCustomerManagedTransfer } from './customerManagedTransfer'
import { readCustomerEditorAvailability } from './customerEditorLaunch'

function options(event: H3Event): CustomerDashboardDependencies {
  const env = event.context.cloudflare?.env ?? {}
  const setting = (key: string) => env[key] ?? process.env[key]
  const runtime = getPageStudioProvisioningRuntime(customerPreviewRuntimeEnvironment(env) ?? undefined)
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
    const dashboard = await readCustomerDashboard(token, options(event))
    const managedTransfer = dashboard.siteId ? await readCustomerManagedTransfer(token, dashboard.siteId, { env: event.context.cloudflare?.env ?? {} }) : null
    const editorBlocked = (managedTransfer && !managedTransfer.completed)
      || (!dashboard.siteId && event.context.cloudflare?.env?.PAGE_STUDIO_CONTENT_ENVIRONMENT === 'production')
    const editor = editorBlocked ? null : await customerEditorRequestOptions(event, token)
    const cms = customerCmsSetupOptions(event)
    const canPrepareCms = !managedTransfer && cms ? await customerCmsSetupAvailable(token, cms) : false
    const canOpenStudio = (!managedTransfer || managedTransfer.completed) && editor ? await readCustomerEditorAvailability(token, editor) : false
    // Current native authority plus verified managed content supersedes the
    // historical preview job. This proves editing readiness, not publication.
    if (managedTransfer?.completed) return { ...dashboard, managedTransfer, state: canOpenStudio ? 'editor-ready' : 'connection-pending', stage: 5,
      canOpenStudio, canPrepareCms: false, canCreate: false, canRetry: false, recovery: undefined }
    if (managedTransfer) return { ...dashboard, managedTransfer, state: 'transfer-pending',
      canOpenStudio: false, canPrepareCms: false, canCreate: false, canRetry: false, recovery: undefined }
    if (canOpenStudio) return { ...dashboard, managedTransfer, state: 'editor-ready', stage: 5,
      canOpenStudio, canPrepareCms: false, canCreate: false, canRetry: false, recovery: undefined }
    return { ...dashboard, managedTransfer, canPrepareCms, canOpenStudio }
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

export async function customerRecoveryHandler(event: H3Event) {
  guardCustomerRequest(event, 'POST')
  const token = customerSessionToken(event)
  const body = CustomerProvisioningRecoverySchema.safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Invalid recovery request.' })
  const dependencies = options(event)
  if (!dependencies.enabled) throw createError({ statusCode: 403, statusMessage: 'Preview recovery is not available yet.' })
  await limitCustomerRequest(event, `preview:${await digestPortalSessionToken(token)}`, 10)
  try {
    return await recoverCustomerDashboardPreview(token, body.data, dependencies)
  } catch (error) { safeError(error) }
}
