// GET /email/view?c=<campaign>&v=<frozen content digest>&t=<webview signature>
// Public, unauthenticated hosted web version of an opted-in frozen campaign.
// Gated by FIGFLOW_EDM_WORKFLOW_ENABLED; never reads cookies or sets any.
import { defineEventHandler, getQuery, setResponseHeaders, setResponseStatus } from 'h3'
import { queryOneFresh } from '~~/server/utils/db'
import { emailLinkSecret } from '~~/server/utils/email-marketing/links'
import { isEmailReviewWorkflowEnabled } from '~~/server/utils/email-marketing/review'
import {
  renderFrozenWebVersion,
  verifyWebVersionRequest,
  webVersionAvailable,
  WEB_VERSION_HEADERS,
  WEB_VERSION_ROW_SQL,
  WEB_VERSION_UNAVAILABLE_HTML,
  type FrozenWebVersionRow
} from '~~/server/utils/email-marketing/webVersion'

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, WEB_VERSION_HEADERS)
  const unavailable = () => {
    setResponseStatus(event, 404)
    return WEB_VERSION_UNAVAILABLE_HTML
  }
  const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
  if (!isEmailReviewWorkflowEnabled(env)) return unavailable()
  const request = await verifyWebVersionRequest(getQuery(event), emailLinkSecret())
  if (!request) return unavailable()
  const row = await queryOneFresh<FrozenWebVersionRow>(WEB_VERSION_ROW_SQL, [request.campaignId])
  if (!webVersionAvailable(row, request)) return unavailable()
  try {
    return await renderFrozenWebVersion(row)
  } catch {
    return unavailable()
  }
})
