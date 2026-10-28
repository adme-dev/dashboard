import { createError } from 'h3'
import { getAdapter } from '~~/server/utils/leads/destinations'

export interface LeadRuleConfigDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<{ id: string, client_id: string }> }>
}
export function validateLeadRuleDestination(destinationType: string, config: unknown): void {
  const adapter = getAdapter(destinationType)
  if (!adapter) throw createError({ statusCode: 400, statusMessage: 'unknown_type' })
  const validation = adapter.validateConfig(config)
  if (!validation.valid) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_config', data: validation.errors })
  }
}
export async function assertLeadRuleFormClient(
  db: LeadRuleConfigDb,
  input: { clientId: string, source: string, formId: string, ruleId?: string }
): Promise<string | null> {
  const existing = input.ruleId
    ? (await db.query('SELECT id,client_id FROM lead_form_rules WHERE id=$1', [input.ruleId])).rows[0]
    : (await db.query('SELECT id,client_id FROM lead_form_rules WHERE source=$1 AND form_id=$2', [input.source, input.formId])).rows[0]
  if (!existing) return null
  if (existing.client_id !== input.clientId || (input.ruleId && existing.id !== input.ruleId)) {
    throw createError({ statusCode: 409, statusMessage: 'form_rule_client_conflict' })
  }
  return existing.id
}
export async function assertLeadEmailRuleEndpoint(
  db: LeadRuleConfigDb,
  input: { clientId: string, formId: string }
): Promise<void> {
  const endpoint = (await db.query(`SELECT id,client_id FROM lead_email_endpoints
    WHERE client_id=$1 AND form_id=$2 AND retired_at IS NULL FOR SHARE`, [input.clientId, input.formId])).rows[0]
  if (!endpoint) throw createError({ statusCode: 400, statusMessage: 'email_endpoint_client_mismatch' })
}
