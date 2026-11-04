import { queryOne, queryRows } from '~~/server/utils/db'
import type {
  ConditionDefinition,
  ConditionDefinitionInput
} from '~~/shared/emailRendering/conditions'

// Authorized scope is present in every SQL predicate; no send-path catalog joins.
export function listConditionDefinitions(clientId: string) {
  return queryRows<ConditionDefinition>(
    'SELECT id, client_id, name, predicate FROM email_content_conditions WHERE client_id=$1 ORDER BY name,id',
    [clientId]
  )
}
export function createConditionDefinition(input: ConditionDefinitionInput) {
  return queryOne<ConditionDefinition>(
    `INSERT INTO email_content_conditions(client_id,name,predicate) VALUES ($1,$2,$3::jsonb)
    ON CONFLICT (client_id,name) DO NOTHING RETURNING id,client_id,name,predicate`,
    [input.client_id, input.name, JSON.stringify(input.predicate)]
  )
}
export function updateConditionDefinition(
  id: string,
  clientId: string,
  patch: Partial<Pick<ConditionDefinitionInput, 'name' | 'predicate'>>
) {
  return queryOne<ConditionDefinition>(
    `UPDATE email_content_conditions SET name=COALESCE($3,name),predicate=COALESCE($4::jsonb,predicate),updated_at=now()
    WHERE id=$1 AND client_id=$2 RETURNING id,client_id,name,predicate`,
    [
      id,
      clientId,
      patch.name ?? null,
      patch.predicate ? JSON.stringify(patch.predicate) : null
    ]
  )
}
export function deleteConditionDefinition(id: string, clientId: string) {
  return queryOne<{ id: string }>(
    'DELETE FROM email_content_conditions WHERE id=$1 AND client_id=$2 RETURNING id',
    [id, clientId]
  )
}
