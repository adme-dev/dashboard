import type { CrmRecordAccessContext } from './searchContext'

export type CrmRecordType = 'person' | 'company' | 'opportunity' | 'activity' | 'task'

export interface CrmRecordRef {
  type: CrmRecordType
  id: string
}

export interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<{ rows?: unknown[] }>
}

export interface AuthoritativeCrmRecord {
  type: CrmRecordType
  id: string
  clientId: string
  row: Record<string, unknown>
}

const promotionTables = {
  person: 'crm_people',
  opportunity: 'crm_opportunities'
} as const

export async function requireAllCrmRecordsAccess(
  context: CrmRecordAccessContext,
  refs: readonly CrmRecordRef[],
  client?: TransactionClient
): Promise<readonly AuthoritativeCrmRecord[]> {
  if (!client) throw new Error('CRM lead promotion authorization requires a transaction')
  if (context.actorType !== 'system'
    || context.trustedSystem.purpose !== 'lead_crm_promotion') {
    throw new Error('Unsupported trusted CRM context')
  }

  const records = new Array<AuthoritativeCrmRecord>(refs.length)
  const lockOrder = refs
    .map((ref, index) => ({ ref, index }))
    .sort((a, b) => a.ref.type.localeCompare(b.ref.type)
      || a.ref.id.localeCompare(b.ref.id)
      || a.index - b.index)

  for (const item of lockOrder) {
    if (item.ref.type !== 'person' && item.ref.type !== 'opportunity') {
      throw new Error(`Unsupported CRM promotion record type: ${item.ref.type}`)
    }
    const table = promotionTables[item.ref.type]
    const result = await client.query(
      `SELECT *
         FROM ${table}
        WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL
        FOR UPDATE`,
      [item.ref.id, context.clientId]
    )
    const row = result.rows?.[0] as Record<string, unknown> | undefined
    if (!row) throw new Error('CRM promotion record is unavailable')
    records[item.index] = {
      type: item.ref.type,
      id: item.ref.id,
      clientId: context.clientId,
      row
    }
  }
  return records
}
