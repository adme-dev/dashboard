import { queryOne } from '~~/server/utils/db'

interface SiteIntelligenceAuditExecutor {
  query: <T = unknown>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>
}

export interface SiteIntelligenceAuditActor {
  id: string | null
}

export type SiteIntelligenceAuditEntityType = 'domain' | 'run' | 'change' | 'insight'

export async function writeSiteIntelligenceAudit(
  actor: SiteIntelligenceAuditActor,
  clientId: string,
  action: string,
  entityType: SiteIntelligenceAuditEntityType,
  entityId: string,
  safeMetadata: Record<string, unknown>,
  executor?: SiteIntelligenceAuditExecutor
): Promise<string | null> {
  const sql = `
    INSERT INTO site_intelligence_audit_events (
      client_id, actor_id, action, entity_type, entity_id, metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    RETURNING id
  `
  const params = [clientId, actor.id, action, entityType, entityId, JSON.stringify(safeMetadata)]

  if (executor) {
    const result = await executor.query<{ id: string }>(sql, params)
    return result.rows[0]?.id ?? null
  }

  const row = await queryOne<{ id: string }>(sql, params)
  return row?.id ?? null
}
