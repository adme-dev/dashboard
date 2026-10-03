import { createError } from 'h3'

/** Static SQL identifiers only. Never pass a caller-controlled table alias. */
export function socialReviewVersionSql(alias: 'p' | 'social_posts' = 'social_posts') {
  return `encode(sha256(convert_to(to_jsonb(${alias})::text,'UTF8')),'hex')`
}
export function assertSocialReviewVersion(value: unknown, current: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value) || value !== current) {
    throw createError({ statusCode: 409, statusMessage: 'This post changed or needs a fresh review. Reload and review it before deciding.' })
  }
}
export const SOCIAL_CUSTOMER_GATE_SQL = `(client_approval_status = 'approved' OR
  (client_approval_status IS NULL AND metadata->>'source' IS DISTINCT FROM 'mcp_news'))`
