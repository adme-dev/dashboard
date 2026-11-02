// GET /email/view?c=<campaign>&v=<frozen content digest>&t=<webview signature>
// Public, unauthenticated hosted web version of an opted-in, gated, frozen
// campaign. Served whatever FIGFLOW_EDM_WORKFLOW_ENABLED says, so a rollback
// never strands links that were already sent; new links only exist for gated
// campaigns whose web version was enabled while the workflow was on. Never
// reads cookies or sets any.
import { defineEventHandler, getQuery, setResponseHeaders, setResponseStatus } from 'h3'
import { queryOneFresh } from '~~/server/utils/db'
import { emailLinkSecret } from '~~/server/utils/email-marketing/links'
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
