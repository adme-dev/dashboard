/**
 * Reconcile current Google and Meta campaign jobs from Monday's Marketing board.
 *
 * Dry-run (default):
 *   pnpm sync:monday-campaigns
 * Apply:
 *   pnpm run sync:monday-campaigns -- --apply
 */

import pg from 'pg'
import { MondayClient, type MondayColumnValue, type MondayItem } from '../server/utils/mondayClient'
import {
  assertMondayCampaignBoardColumns,
  buildMondayCampaignSnapshot,
  canReuseMondayCampaignProject,
  mondayClientMatchScore,
  MONDAY_MARKETING_BOARD_ID,
  selectActiveMondayCampaignJobs,
  toXeroFlowCampaignStatus,
  type MondayCampaignSnapshot
} from '../server/utils/mondayCampaignJobs'

const apply = process.argv.includes('--apply')
const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required')

const pool = new pg.Pool({ connectionString, max: 1 })
pool.on('error', () => undefined)

type MappingContext = {
  id: string
  migration_session_id: string
  department_id: string
  department_name: string
}

type ExistingTask = { id: string, title: string, monday_item_id: string | null }

type XeroContact = {
  tenantId: string
  contactId: string
  name: string
}

type AgencyClient = { id: string, name: string, xero_contact_id: string | null }

function resolveXeroContact(clientLabel: string, contacts: XeroContact[]): XeroContact {
  const ranked = contacts
    .map(contact => ({ contact, score: mondayClientMatchScore(clientLabel, contact.name) }))
    .filter((candidate): candidate is { contact: XeroContact, score: number } => candidate.score !== null)
    .sort((left, right) => left.score - right.score || left.contact.name.localeCompare(right.contact.name))

  if (ranked.length === 0) throw new Error(`No active Xero customer matches Monday client ${clientLabel}`)
  const bestScore = ranked[0]!.score
  const best = ranked.filter(candidate => candidate.score === bestScore)
  if (best.length !== 1) throw new Error(`Monday client ${clientLabel} has more than one equally exact Xero match`)
  return best[0]!.contact
}

function parsedColumnValue(value: MondayColumnValue): unknown {
  if (!value.value) return null
  try {
    return JSON.parse(value.value)
  } catch {
    return value.value
  }
}

function firstMondayPersonId(item: MondayItem): string | null {
  const people = item.column_values?.find(value => value.type === 'people')
  if (!people?.value) return null
  try {
    const parsed: unknown = JSON.parse(people.value)
    if (!parsed || typeof parsed !== 'object' || !('personsAndTeams' in parsed)) return null
    const entries = (parsed as { personsAndTeams?: unknown }).personsAndTeams
    if (!Array.isArray(entries)) return null
    const peopleEntries = entries.filter((entry): entry is { id?: unknown, kind?: unknown } => (
      Boolean(entry) && typeof entry === 'object'
    ))
    const person = peopleEntries.find(entry => entry.kind !== 'team') || peopleEntries[0]
    return person?.id ? String(person.id) : null
  } catch {
    return null
  }
}

async function fetchAllItems(client: MondayClient): Promise<MondayItem[]> {
  const items: MondayItem[] = []
  let cursor: string | undefined
  do {
    const page = await client.getItems(MONDAY_MARKETING_BOARD_ID, { limit: 100, cursor })
    items.push(...page.items)
    cursor = page.cursor
  } while (cursor)
  return items
}

async function findExistingTask(mondayItemId: string): Promise<ExistingTask | null> {
  const result = await pool.query<ExistingTask>(
    `SELECT t.id, t.title, t.monday_item_id
       FROM tasks t
      WHERE t.monday_item_id = $1
         OR t.id = (
           SELECT task_id FROM monday_item_mappings
            WHERE monday_item_id = $1 AND task_id IS NOT NULL
            ORDER BY updated_at DESC, created_at DESC LIMIT 1
         )
      ORDER BY (t.monday_item_id = $1) DESC
      LIMIT 1`,
    [mondayItemId]
  )
  return result.rows[0] || null
}

async function findAgencyClient(contact: XeroContact): Promise<AgencyClient | null> {
  const result = await pool.query<AgencyClient>(
    `SELECT id, name, xero_contact_id
       FROM agency_clients
      WHERE xero_contact_id = $1
         OR regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = regexp_replace(lower($2), '[^a-z0-9]', '', 'g')
      ORDER BY (xero_contact_id = $1) DESC, updated_at DESC`,
    [contact.contactId, contact.name]
  )
  const exactXeroMatches = result.rows.filter(row => row.xero_contact_id === contact.contactId)
  if (exactXeroMatches.length > 1 || (exactXeroMatches.length === 0 && result.rows.length > 1)) {
    throw new Error(`Xero contact ${contact.name} matches multiple XeroFlow clients`)
  }
  return exactXeroMatches[0] || result.rows[0] || null
}

async function ensureAgencyClient(
  db: pg.PoolClient,
  contact: XeroContact
): Promise<{ client: AgencyClient, created: boolean }> {
  const result = await db.query<AgencyClient>(
    `SELECT id, name, xero_contact_id
       FROM agency_clients
      WHERE xero_contact_id = $1
         OR regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = regexp_replace(lower($2), '[^a-z0-9]', '', 'g')
      ORDER BY (xero_contact_id = $1) DESC, updated_at DESC
      FOR UPDATE`,
    [contact.contactId, contact.name]
  )
  const exactXeroMatches = result.rows.filter(row => row.xero_contact_id === contact.contactId)
  if (exactXeroMatches.length > 1 || (exactXeroMatches.length === 0 && result.rows.length > 1)) {
    throw new Error(`Xero contact ${contact.name} matches multiple XeroFlow clients`)
  }

  let client = exactXeroMatches[0] || result.rows[0]
  let created = false
  if (!client) {
    const inserted = await db.query<AgencyClient>(
      `INSERT INTO agency_clients (name, xero_contact_id, billing_type, is_active)
       VALUES ($1, $2, 'project', true)
       RETURNING id, name, xero_contact_id`,
      [contact.name, contact.contactId]
    )
    client = inserted.rows[0]!
    created = true
  } else if (!client.xero_contact_id) {
    const updated = await db.query<AgencyClient>(
      `UPDATE agency_clients SET xero_contact_id = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, name, xero_contact_id`,
      [contact.contactId, client.id]
    )
    client = updated.rows[0]!
  } else if (client.xero_contact_id !== contact.contactId) {
    throw new Error(`XeroFlow client ${client.name} is linked to a different Xero contact`)
  }

  const contactLink = await db.query<{ client_id: string }>(
    `SELECT client_id FROM client_xero_contacts
      WHERE tenant_id = $1 AND xero_contact_id = $2
      FOR UPDATE`,
    [contact.tenantId, contact.contactId]
  )
  if (contactLink.rows[0] && contactLink.rows[0].client_id !== client.id) {
    throw new Error(`Xero contact ${contact.name} is already linked to another XeroFlow client`)
  }
  if (!contactLink.rows[0]) {
    await db.query(
      `INSERT INTO client_xero_contacts
         (client_id, tenant_id, xero_contact_id, xero_name)
       VALUES ($1, $2, $3, $4)`,
      [client.id, contact.tenantId, contact.contactId, contact.name]
    )
  }

  return { client, created }
}

async function ensureCampaignProject(
  db: pg.PoolClient,
  snapshot: MondayCampaignSnapshot,
  clientId: string,
  existingProjectId: string | null
): Promise<{ id: string, created: boolean }> {
  if (existingProjectId) {
    const current = await db.query<{ id: string, task_count: number }>(
      `SELECT project.id,
              (SELECT COUNT(*)::int FROM tasks WHERE project_id = project.id) AS task_count
         FROM projects project
        WHERE project.id = $1
        FOR UPDATE`,
      [existingProjectId]
    )
    if (!current.rows[0]) throw new Error(`Campaign project ${existingProjectId} no longer exists`)
    if (canReuseMondayCampaignProject(current.rows[0].task_count)) {
      const updated = await db.query<{ id: string }>(
        `UPDATE projects
            SET client_id = $1,
                budget_amount = COALESCE($2, budget_amount),
                budget_type = CASE WHEN $2::numeric IS NULL THEN budget_type ELSE COALESCE(budget_type, 'fixed') END,
                end_date = COALESCE($3::date, end_date),
                updated_at = NOW()
          WHERE id = $4
          RETURNING id`,
        [clientId, snapshot.budget, snapshot.campaignEndDate, existingProjectId]
      )
      return { id: updated.rows[0]!.id, created: false }
    }
  }

  const inserted = await db.query<{ id: string }>(
    `INSERT INTO projects
       (client_id, name, description, budget_amount, budget_type, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, 'fixed', $5::date, $6, 'active')
     RETURNING id`,
    [clientId, snapshot.name.slice(0, 255),
      `Source: Monday Marketing board ${snapshot.mondayBoardId} item ${snapshot.mondayItemId}.`,
      snapshot.budget ?? 0, snapshot.createdAt.slice(0, 10), snapshot.campaignEndDate]
  )
  return { id: inserted.rows[0]!.id, created: true }
}

async function reconcileSnapshot(
  db: pg.PoolClient,
  context: MappingContext,
  snapshot: MondayCampaignSnapshot,
  xeroContact: XeroContact
): Promise<{ taskAction: 'created' | 'updated', clientCreated: boolean, projectCreated: boolean }> {
  const statusName = toXeroFlowCampaignStatus(snapshot.sourceStatus)
  const status = await db.query<{ id: string }>(
    `SELECT id FROM task_statuses
      WHERE department_id = $1 AND name = $2
      LIMIT 1`,
    [context.department_id, statusName]
  )
  if (!status.rows[0]) throw new Error(`XeroFlow status ${statusName} is missing from ${context.department_name}`)

  const personId = firstMondayPersonId(snapshot.sourceItem)
  const assignee = personId
    ? await db.query<{ id: string }>(
        'SELECT id FROM team_members WHERE monday_user_id = $1 AND is_active = true LIMIT 1',
        [personId]
      )
    : null

  const existing = await db.query<ExistingTask & { project_id: string | null }>(
    `SELECT t.id, t.title, t.monday_item_id, t.project_id
       FROM tasks t
      WHERE t.monday_item_id = $1
         OR t.id = (
           SELECT task_id FROM monday_item_mappings
            WHERE monday_item_id = $1 AND task_id IS NOT NULL
            ORDER BY updated_at DESC, created_at DESC LIMIT 1
         )
      ORDER BY (t.monday_item_id = $1) DESC
      LIMIT 1
      FOR UPDATE`,
    [snapshot.mondayItemId]
  )

  const clientResolution = await ensureAgencyClient(db, xeroContact)
  const project = await ensureCampaignProject(
    db,
    snapshot,
    clientResolution.client.id,
    existing.rows[0]?.project_id || null
  )

  let action: 'created' | 'updated'
  let taskId: string
  if (existing.rows[0]) {
    action = 'updated'
    taskId = existing.rows[0].id
    await db.query(
      `UPDATE tasks
          SET title = $1, department_id = $2, status_id = $3,
              due_date = $4, assignee_id = COALESCE($5, assignee_id),
              project_id = $6, monday_item_id = $7, monday_board_id = $8,
              updated_at = NOW()
        WHERE id = $9`,
      [snapshot.name.slice(0, 255), context.department_id, status.rows[0].id,
        snapshot.dueDate, assignee?.rows[0]?.id || null, project.id,
        snapshot.mondayItemId, snapshot.mondayBoardId, taskId]
    )
  } else {
    action = 'created'
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO tasks
         (title, department_id, status_id, priority, task_type, due_date,
          assignee_id, project_id, monday_item_id, monday_board_id, created_at, updated_at)
       VALUES ($1, $2, $3, 'medium', 'task', $4, $5, $6, $7, $8,
               $9::timestamptz, $10::timestamptz)
       RETURNING id`,
      [snapshot.name.slice(0, 255), context.department_id, status.rows[0].id,
        snapshot.dueDate, assignee?.rows[0]?.id || null, project.id,
        snapshot.mondayItemId, snapshot.mondayBoardId, snapshot.createdAt, snapshot.updatedAt]
    )
    taskId = inserted.rows[0]!.id
  }

  const mappedValues = Object.fromEntries((snapshot.sourceItem.column_values || []).map((value) => {
    const column = snapshot.columns.find(candidate => candidate.id === value.id)
    return [column?.title || value.id, value.text || parsedColumnValue(value)]
  }))
  const sourceData = JSON.stringify({
    ...snapshot.sourceItem,
    group: { id: snapshot.groupId, title: snapshot.groupTitle }
  })

  const mapping = await db.query<{ id: string }>(
    `SELECT id FROM monday_item_mappings
      WHERE monday_item_id = $1
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
      FOR UPDATE`,
    [snapshot.mondayItemId]
  )
  if (mapping.rows[0]) {
    await db.query(
      `UPDATE monday_item_mappings
          SET task_id = $1, monday_item_name = $2, source_data = $3::jsonb,
              column_values = $4::jsonb, status = 'completed', error_message = NULL,
              monday_board_id = $5, monday_group_id = $6, monday_group_title = $7,
              archived = false, source_state = 'active', reconciliation_status = 'current',
              source_updated_at = $8::timestamptz, last_seen_at = NOW(), updated_at = NOW()
        WHERE id = $9`,
      [taskId, snapshot.name.slice(0, 500), sourceData, JSON.stringify(mappedValues),
        snapshot.mondayBoardId, snapshot.groupId || null, snapshot.groupTitle || null,
        snapshot.updatedAt, mapping.rows[0].id]
    )
  } else {
    await db.query(
      `INSERT INTO monday_item_mappings
         (migration_session_id, board_mapping_id, monday_item_id, monday_item_name,
          task_id, source_data, column_values, status, monday_board_id,
          monday_group_id, monday_group_title, archived, source_state,
          reconciliation_status, source_updated_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 'completed', $8,
               $9, $10, false, 'active', 'current', $11::timestamptz, NOW())`,
      [context.migration_session_id, context.id, snapshot.mondayItemId,
        snapshot.name.slice(0, 500), taskId, sourceData, JSON.stringify(mappedValues),
        snapshot.mondayBoardId, snapshot.groupId || null, snapshot.groupTitle || null,
        snapshot.updatedAt]
    )
  }

  for (const value of snapshot.sourceItem.column_values || []) {
    const column = snapshot.columns.find(candidate => candidate.id === value.id)
    await db.query(
      `INSERT INTO task_monday_column_values
         (task_id, monday_column_id, column_title, column_type, value_json,
          text_value, settings_str, migrated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW())
       ON CONFLICT (task_id, monday_column_id) DO UPDATE SET
         column_title = EXCLUDED.column_title,
         column_type = EXCLUDED.column_type,
         value_json = EXCLUDED.value_json,
         text_value = EXCLUDED.text_value,
         settings_str = EXCLUDED.settings_str,
         migrated_at = NOW()`,
      [taskId, value.id, column?.title || value.id, value.type,
        JSON.stringify(parsedColumnValue(value)), value.text || null,
        column?.settings_str || null]
    )
  }

  return {
    taskAction: action,
    clientCreated: clientResolution.created,
    projectCreated: project.created
  }
}

async function main() {
  const integration = await pool.query<{
    id: string
    access_token: string
    account_id: string | null
    settings: Record<string, unknown> | string | null
  }>(
    `SELECT id, access_token, account_id, settings
       FROM integration_configs
      WHERE integration_type = 'monday'
      LIMIT 1`
  )
  if (!integration.rows[0]?.access_token) throw new Error('XeroFlow Monday connection is not configured')

  const monday = new MondayClient(integration.rows[0].access_token)
  const account = await monday.testConnection()
  if (integration.rows[0].account_id && account.id !== integration.rows[0].account_id) {
    throw new Error('Stored Monday account does not match the connected account')
  }

  const board = await monday.getBoard(MONDAY_MARKETING_BOARD_ID)
  if (!board || board.name !== 'Marketing') throw new Error('Expected Monday Marketing board was not found')
  assertMondayCampaignBoardColumns(board.columns || [])

  const contextResult = await pool.query<MappingContext>(
    `SELECT mapping.id, mapping.migration_session_id, mapping.department_id,
            department.name AS department_name
       FROM monday_board_mappings mapping
       JOIN departments department ON department.id = mapping.department_id
      WHERE mapping.monday_board_id = $1
        AND mapping.department_id IS NOT NULL
        AND mapping.migration_session_id IS NOT NULL
      ORDER BY mapping.updated_at DESC
      LIMIT 1`,
    [MONDAY_MARKETING_BOARD_ID]
  )
  const context = contextResult.rows[0]
  if (!context || context.department_name !== 'Marketing') {
    throw new Error('Monday Marketing board is not mapped to the XeroFlow Marketing department')
  }

  const allItems = await fetchAllItems(monday)
  const snapshots = selectActiveMondayCampaignJobs(allItems)
    .map(item => buildMondayCampaignSnapshot(item, board.columns || []))
    .sort((left, right) => left.mondayItemId.localeCompare(right.mondayItemId))

  const xeroContactsResult = await pool.query<{
    tenantId: string
    contactId: string
    name: string
  }>(
    `SELECT tenant_id AS "tenantId", contact_id AS "contactId", name
       FROM xero_contacts_cache
      WHERE status = 'ACTIVE' AND is_customer = true`
  )
  const resolvedContacts = new Map(snapshots.map(snapshot => [
    snapshot.mondayItemId,
    resolveXeroContact(snapshot.clientLabel, xeroContactsResult.rows)
  ]))

  const plan = await Promise.all(snapshots.map(async snapshot => ({
    mondayItemId: snapshot.mondayItemId,
    name: snapshot.name,
    client: snapshot.clientLabel,
    platform: snapshot.platform,
    campaignType: snapshot.campaignType,
    sourceStatus: snapshot.sourceStatus,
    xeroFlowStatus: toXeroFlowCampaignStatus(snapshot.sourceStatus),
    xeroContact: resolvedContacts.get(snapshot.mondayItemId)!.name,
    clientAction: (await findAgencyClient(resolvedContacts.get(snapshot.mondayItemId)!)) ? 'link' : 'create',
    action: (await findExistingTask(snapshot.mondayItemId)) ? 'update' : 'create'
  })))

  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', boardId: MONDAY_MARKETING_BOARD_ID, count: plan.length, jobs: plan }, null, 2))
    return
  }

  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    let created = 0
    let updated = 0
    const clientsCreated = new Set<string>()
    let projectsCreated = 0
    for (const snapshot of snapshots) {
      const contact = resolvedContacts.get(snapshot.mondayItemId)
      if (!contact) throw new Error(`Missing Xero resolution for Monday item ${snapshot.mondayItemId}`)
      const result = await reconcileSnapshot(db, context, snapshot, contact)
      if (result.taskAction === 'created') created++
      else updated++
      if (result.clientCreated) clientsCreated.add(contact.contactId)
      if (result.projectCreated) projectsCreated++
    }

    const settingsResult = await db.query<{ settings: Record<string, unknown> | string | null }>(
      `SELECT settings FROM integration_configs
        WHERE id = $1
        FOR UPDATE`,
      [integration.rows[0].id]
    )
    const rawSettings = settingsResult.rows[0]?.settings
    const settings = typeof rawSettings === 'string' ? JSON.parse(rawSettings || '{}') : { ...(rawSettings || {}) }
    const connectedBoards = Array.from(new Set([
      ...((Array.isArray(settings.connectedBoards) ? settings.connectedBoards : []) as string[]),
      MONDAY_MARKETING_BOARD_ID
    ]))
    const boardMappings = {
      ...((settings.boardMappings && typeof settings.boardMappings === 'object') ? settings.boardMappings : {}),
      [MONDAY_MARKETING_BOARD_ID]: { departmentId: context.department_id }
    }
    await db.query(
      `UPDATE integration_configs
          SET settings = $1::jsonb, updated_at = NOW()
        WHERE id = $2`,
      [JSON.stringify({ ...settings, connectedBoards, boardMappings }), integration.rows[0].id]
    )

    await db.query('COMMIT')
    console.log(JSON.stringify({
      mode: 'apply',
      boardId: MONDAY_MARKETING_BOARD_ID,
      count: snapshots.length,
      tasksCreated: created,
      tasksUpdated: updated,
      clientsCreated: clientsCreated.size,
      projectsCreated
    }, null, 2))
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    db.release()
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
