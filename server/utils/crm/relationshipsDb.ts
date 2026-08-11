// server/utils/crm/relationshipsDb.ts
// Shared DB helpers for relationships (used by agency + portal endpoints).
import { queryRows, queryOne } from '~~/server/utils/db'
import { inverseOf, wouldCreateCycle } from './relationships'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireCrmRecordAccess } from '~~/server/utils/crm/recordAccess'

export interface RelationshipView {
  id: string
  other_type: 'person' | 'company'
  other_id: string
  other_name: string
  relationship_type: string // from the target's perspective
  is_decision_maker: boolean
  is_primary_contact: boolean
  notes: string | null
}

async function nameFor(clientId: string, type: string, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!ids.length) return map
  if (type === 'person') {
    const rows = await queryRows<{ id: string, first_name: string, last_name: string | null }>(
      `SELECT id, first_name, last_name FROM crm_people
        WHERE client_id = $1 AND id = ANY($2) AND deleted_at IS NULL`,
      [clientId, ids],
    )
    for (const r of rows) map.set(r.id, [r.first_name, r.last_name].filter(Boolean).join(' '))
  } else {
    const rows = await queryRows<{ id: string, name: string }>(
      `SELECT id, name FROM crm_companies
        WHERE client_id = $1 AND id = ANY($2) AND deleted_at IS NULL`,
      [clientId, ids],
    )
    for (const r of rows) map.set(r.id, r.name)
  }
  return map
}

// All relationships touching (targetType,targetId), normalized to that target's view.
export async function listRelationships(
  scope: string | CrmSearchContext, targetType: 'person' | 'company', targetId: string,
): Promise<RelationshipView[]> {
  const clientId = typeof scope === 'string' ? scope : scope.clientId
  if (typeof scope !== 'string') await requireCrmRecordAccess(scope, { type: targetType, id: targetId })
  const rows = await queryRows<{
    id: string, from_type: 'person' | 'company', from_id: string, to_type: 'person' | 'company', to_id: string,
    relationship_type: string, is_decision_maker: boolean, is_primary_contact: boolean, notes: string | null
  }>(
    `SELECT id, from_type, from_id, to_type, to_id, relationship_type, is_decision_maker, is_primary_contact, notes
       FROM crm_relationships
      WHERE client_id = $1
        AND ((from_type = $2 AND from_id = $3) OR (to_type = $2 AND to_id = $3))`,
    [clientId, targetType, targetId],
  )

  const views = rows.map((r) => {
    const isFrom = r.from_type === targetType && r.from_id === targetId
    return {
      id: r.id,
      other_type: isFrom ? r.to_type : r.from_type,
      other_id: isFrom ? r.to_id : r.from_id,
      relationship_type: isFrom ? r.relationship_type : inverseOf(r.relationship_type),
      is_decision_maker: r.is_decision_maker,
      is_primary_contact: r.is_primary_contact,
      notes: r.notes,
    }
  })

  const visibleViews = typeof scope === 'string'
    ? views
    : (await Promise.all(views.map(async view => {
        try {
          await requireCrmRecordAccess(scope, { type: view.other_type, id: view.other_id })
          return view
        } catch (error: any) {
          if (error?.statusCode === 404) return null
          throw error
        }
      }))).filter((view): view is typeof views[number] => view !== null)

  const personIds = visibleViews.filter(v => v.other_type === 'person').map(v => v.other_id)
  const companyIds = visibleViews.filter(v => v.other_type === 'company').map(v => v.other_id)
  const [people, companies] = await Promise.all([
    nameFor(clientId, 'person', personIds),
    nameFor(clientId, 'company', companyIds),
  ])
  return visibleViews.map(v => ({
    ...v,
    other_name: (v.other_type === 'person' ? people.get(v.other_id) : companies.get(v.other_id)) ?? 'Unknown',
  }))
}

// Throws a 400-style Error if a new company-hierarchy edge would create a cycle.
export async function assertNoHierarchyCycle(
  clientId: string, fromType: string, fromId: string, toType: string, toId: string, relationshipType: string,
): Promise<void> {
  if (fromType !== 'company' || toType !== 'company') return
  if (relationshipType !== 'parent_of' && relationshipType !== 'subsidiary_of') return

  const rows = await queryRows<{ from_id: string, to_id: string, relationship_type: string }>(
    `SELECT from_id, to_id, relationship_type FROM crm_relationships
      WHERE client_id = $1 AND from_type = 'company' AND to_type = 'company'
        AND relationship_type IN ('parent_of','subsidiary_of')`,
    [clientId],
  )
  // Normalize every edge to [parent, child].
  const edges: [string, string][] = rows.map(r =>
    r.relationship_type === 'parent_of' ? [r.from_id, r.to_id] : [r.to_id, r.from_id],
  )
  const [newParent, newChild] = relationshipType === 'parent_of' ? [fromId, toId] : [toId, fromId]
  if (wouldCreateCycle(edges, newParent, newChild)) {
    throw createError({ statusCode: 400, statusMessage: 'That link would create a circular company hierarchy.' })
  }
}

// Verifies both endpoints exist within the client (prevents dangling/cross-client refs).
export async function assertEndpointsExist(
  clientId: string, fromType: string, fromId: string, toType: string, toId: string,
): Promise<void> {
  const check = async (type: string, id: string) => {
    const table = type === 'person' ? 'crm_people' : 'crm_companies'
    const row = await queryOne(`SELECT id FROM ${table} WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`, [id, clientId])
    if (!row) throw createError({ statusCode: 400, statusMessage: `Unknown ${type}` })
  }
  await check(fromType, fromId)
  await check(toType, toId)
}
