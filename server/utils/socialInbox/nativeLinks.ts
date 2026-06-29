export interface SocialInboxNativeLinkDb {
  queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>
}

export interface SocialInboxNativeLinkInput {
  linked_task_id?: unknown
  linked_client_request_id?: unknown
}

export interface SocialInboxNativeLinkUpdate {
  sets: string[]
  params: unknown[]
  clientId: string
}

export interface SocialInboxNativeLinkRow {
  client_id: string
  linked_task_id: string | null
  linked_client_request_id: string | null
  native_linked_by?: string | null
  native_linked_at?: string | null
}

export interface SocialInboxNativeLinkEventRow {
  id: string
}

export class SocialInboxNativeLinkError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'SocialInboxNativeLinkError'
    this.statusCode = statusCode
  }
}

function hasOwn(input: SocialInboxNativeLinkInput, key: keyof SocialInboxNativeLinkInput) {
  return Object.prototype.hasOwnProperty.call(input, key)
}

function normalizeLinkId(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const id = String(value).trim()
  return id || null
}

function describeLinkChange(input: SocialInboxNativeLinkInput) {
  const changes: string[] = []
  if (hasOwn(input, 'linked_task_id')) {
    changes.push(normalizeLinkId(input.linked_task_id) ? 'task linked' : 'task unlinked')
  }
  if (hasOwn(input, 'linked_client_request_id')) {
    changes.push(normalizeLinkId(input.linked_client_request_id) ? 'client request linked' : 'client request unlinked')
  }
  return changes.length ? `Native workflow updated: ${changes.join(', ')}` : 'Native workflow updated'
}

export async function buildSocialInboxNativeLinkUpdate(
  db: SocialInboxNativeLinkDb,
  conversationId: string,
  input: SocialInboxNativeLinkInput,
  actorId?: string | null
): Promise<SocialInboxNativeLinkUpdate> {
  const conversation = await db.queryOne<{ client_id: string }>(
    'SELECT client_id FROM social_conversations WHERE id = $1',
    [conversationId]
  )
  if (!conversation) {
    throw new SocialInboxNativeLinkError(404, 'Conversation not found')
  }

  const sets: string[] = []
  const params: unknown[] = []
  const set = (fragment: string, value: unknown) => {
    params.push(value)
    sets.push(fragment.replace('$?', `$${params.length}`))
  }

  if (hasOwn(input, 'linked_task_id')) {
    const taskId = normalizeLinkId(input.linked_task_id)
    if (taskId) {
      const task = await db.queryOne<{ id: string }>(
        `SELECT t.id
           FROM tasks t
           JOIN projects p ON p.id = t.project_id
          WHERE t.id = $1
            AND p.client_id = $2`,
        [taskId, conversation.client_id]
      )
      if (!task) {
        throw new SocialInboxNativeLinkError(400, 'Invalid linked task')
      }
    }
    set('linked_task_id = $?', taskId)
  }

  if (hasOwn(input, 'linked_client_request_id')) {
    const requestId = normalizeLinkId(input.linked_client_request_id)
    if (requestId) {
      const request = await db.queryOne<{ id: string }>(
        `SELECT id
           FROM client_requests
          WHERE id = $1
            AND client_id = $2`,
        [requestId, conversation.client_id]
      )
      if (!request) {
        throw new SocialInboxNativeLinkError(400, 'Invalid linked client request')
      }
    }
    set('linked_client_request_id = $?', requestId)
  }

  if (!sets.length) {
    throw new SocialInboxNativeLinkError(400, 'No native links to update')
  }

  if (actorId !== undefined) {
    set('native_linked_by = $?', actorId || null)
    sets.push('native_linked_at = NOW()')
  }

  return { sets, params, clientId: conversation.client_id }
}

export async function updateSocialInboxNativeLinks(
  db: SocialInboxNativeLinkDb,
  conversationId: string,
  input: SocialInboxNativeLinkInput,
  actorId?: string | null
): Promise<SocialInboxNativeLinkRow | null> {
  const update = await buildSocialInboxNativeLinkUpdate(db, conversationId, input, actorId)
  const params = [...update.params, conversationId]
  return await db.queryOne<SocialInboxNativeLinkRow>(
    `UPDATE social_conversations SET ${update.sets.join(', ')}, updated_at = NOW()
      WHERE id = $${params.length}
      RETURNING client_id, linked_task_id, linked_client_request_id, native_linked_by, native_linked_at`,
    params
  )
}

export async function recordSocialInboxNativeLinkEvent(
  db: SocialInboxNativeLinkDb,
  conversationId: string,
  clientId: string,
  input: SocialInboxNativeLinkInput,
  actorId?: string | null
): Promise<SocialInboxNativeLinkEventRow | null> {
  return await db.queryOne<SocialInboxNativeLinkEventRow>(
    `INSERT INTO social_conversation_events
      (conversation_id, client_id, actor_id, event_type, content, metadata)
     VALUES ($1, $2, $3, 'native_link_update', $4, $5::jsonb)
     RETURNING id`,
    [
      conversationId,
      clientId,
      actorId || null,
      describeLinkChange(input),
      JSON.stringify({
        linked_task_id: hasOwn(input, 'linked_task_id') ? normalizeLinkId(input.linked_task_id) : undefined,
        linked_client_request_id: hasOwn(input, 'linked_client_request_id') ? normalizeLinkId(input.linked_client_request_id) : undefined
      })
    ]
  )
}
