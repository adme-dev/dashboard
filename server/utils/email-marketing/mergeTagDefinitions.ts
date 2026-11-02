import { queryOne, queryRows } from '~~/server/utils/db'
import type { MergeDefinition, MergeDefinitionInput } from '~~/shared/emailRendering/mergeTagDefinitions'

// Every operation includes the already-authorized client in the SQL predicate.
export function listMergeDefinitions(clientId: string) {
  return queryRows<MergeDefinition>(`SELECT id, client_id, name, token, preview_value, fallback
    FROM email_merge_tag_definitions WHERE client_id = $1 ORDER BY name, id`, [clientId])
}
export function createMergeDefinition(input: MergeDefinitionInput) {
  return queryOne<MergeDefinition>(`INSERT INTO email_merge_tag_definitions (client_id, name, token, preview_value, fallback)
    VALUES ($1,$2,$3,$4,$5) ON CONFLICT (client_id, token) DO NOTHING
    RETURNING id, client_id, name, token, preview_value, fallback`,
  [input.client_id, input.name, input.token, input.preview_value, input.fallback])
}
export function updateMergeDefinition(id: string, clientId: string, patch: Partial<Pick<MergeDefinitionInput, 'name' | 'preview_value' | 'fallback'>>) {
  return queryOne<MergeDefinition>(`UPDATE email_merge_tag_definitions
    SET name = COALESCE($3,name), preview_value = COALESCE($4,preview_value), fallback = COALESCE($5,fallback), updated_at = now()
    WHERE id = $1 AND client_id = $2 RETURNING id, client_id, name, token, preview_value, fallback`,
  [id, clientId, patch.name ?? null, patch.preview_value ?? null, patch.fallback ?? null])
}
export function deleteMergeDefinition(id: string, clientId: string) {
  return queryOne<{ id: string }>('DELETE FROM email_merge_tag_definitions WHERE id = $1 AND client_id = $2 RETURNING id', [id, clientId])
}
