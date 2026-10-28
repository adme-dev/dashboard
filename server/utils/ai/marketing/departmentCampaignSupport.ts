import { createError } from 'h3'
import { queryOneFresh } from '~~/server/utils/db'
import type { ToolContext } from '../toolContext'

export function campaignDenied(code = 'forbidden'): never {
  throw Object.assign(createError({ statusCode: 403, statusMessage: 'Campaign resource or authority unavailable.' }), { campaignCode: code })
}
export async function requireDepartmentClient(ctx: ToolContext, clientId: string) {
  if (ctx.clientScope && ctx.clientScope !== clientId) campaignDenied('not_found')
  if (!ctx.assistantScope || (ctx.assistantScope.clientAccessMode !== 'all_active' && !ctx.assistantScope.assignedClientIds.includes(clientId))) campaignDenied('not_found')
  if (!await queryOneFresh('SELECT id FROM agency_clients WHERE id=$1 AND is_active=TRUE', [clientId])) campaignDenied('not_found')
}
export function departmentRuntimeEnv(ctx: ToolContext): Record<string, string | undefined> {
  return ctx.event.context.cloudflare?.env as Record<string, string | undefined> | undefined ?? process.env
}
export function departmentGoogleRuntime(ctx: ToolContext) {
  const env = departmentRuntimeEnv(ctx)
  return { googleClientId: env.GOOGLE_CLIENT_ID ?? '', googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? '', googleDeveloperToken: env.GOOGLE_DEVELOPER_TOKEN ?? '', googleAdsLoginCustomerId: env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '' }
}
