import { queryOne, queryRows } from '~~/server/utils/db'

/**
 * Virtual Office — Mode A room context (spec: ai-copilot-virtual-office-integration §3 Mode A).
 *
 * When the conversational co-pilot is docked in an office room, its prompt is enriched with
 * room-scoped facts — who is present, whether there's a live meeting, and the live transcript
 * tail — so "who's free?", "pull up Acme's pacing", and "make a task from what we just discussed"
 * work in-context. This is pure REUSE of the tool loop + memory + skill-packs; no media path.
 *
 * Two halves, mirroring the rest of the AI layer:
 *   - `renderRoomContext` — PURE, I/O-free, unit-tested. Formats a resolved room into a compact
 *     system-prompt block (or '' so the caller appends nothing).
 *   - `resolveRoomContext` — injected-deps. Enforces tenant isolation (membership gate) BEFORE
 *     surfacing anything, and resolves present-user names only for co-members.
 */

export type PresentUser = { id: string, name: string }

export type RoomContext = {
  officeId: string
  officeName: string
  /** Set when the user is currently inside a live meeting in this room. */
  meetingId?: string
  presentUsers: PresentUser[]
  /** Live transcript tail (most-recent text). Capped at render time. */
  transcriptTail?: string
}

export const ROOM_BLOCK_HEADER = 'Current virtual office room:'

/** Hard cap on how many present members we name in the prompt (keeps the block bounded). */
const MAX_PRESENT = 20
/** Hard cap on transcript-tail chars injected into the prompt (keeps the block bounded). */
const MAX_TRANSCRIPT_CHARS = 1200

/**
 * PURE: render a resolved room into a compact system-prompt block. Null / nothing useful → '' so the
 * caller appends nothing. The transcript tail keeps the MOST RECENT `maxTranscriptChars` (it's a
 * rolling tail); when clipped it's prefixed with '…' so the model knows earlier text is omitted.
 */
export function renderRoomContext(room: RoomContext | null, maxTranscriptChars = MAX_TRANSCRIPT_CHARS): string {
  if (!room) return ''

  const lines: string[] = [ROOM_BLOCK_HEADER, `- Office: ${room.officeName}`]
  if (room.meetingId) lines.push('- The user is currently in a live meeting in this room.')

  const present = room.presentUsers.slice(0, MAX_PRESENT)
  if (present.length) {
    const overflow = room.presentUsers.length > present.length ? '+' : ''
    lines.push(`- Present now (${present.length}${overflow}): ${present.map(u => u.name).join(', ')}`)
  } else {
    lines.push('- No other members are currently present.')
  }

  const tail = (room.transcriptTail ?? '').trim()
  if (tail) {
    const clipped = tail.length > maxTranscriptChars ? '…' + tail.slice(-maxTranscriptChars) : tail
    lines.push(`- Recent conversation (live transcript tail):\n${clipped}`)
  }

  lines.push('Use this room context for questions about who is around, what was just discussed, or to act on the current meeting.')
  return lines.join('\n')
}

export interface RoomContextDeps {
  /** Authorization basis — true only if `userId` is a staff member of `officeId`. */
  isMember(officeId: string, userId: string): Promise<boolean>
  getOfficeName(officeId: string): Promise<string | null>
  /** Resolve names for the supplied ids — MUST return only ids that are co-members of `officeId`. */
  resolvePresentUsers(officeId: string, userIds: string[]): Promise<PresentUser[]>
}

/**
 * Resolve room context for a docked co-pilot turn, or null if the room shouldn't be surfaced.
 *
 * Tenant isolation (spec §7): we never enrich the prompt with a room the user doesn't belong to —
 * the membership gate runs FIRST and a non-member returns null (no office name, no roster, no
 * transcript). Present-user names are resolved via `resolvePresentUsers`, which filters to
 * co-members, so a spoofed or foreign id supplied by the client is never named or leaked.
 */
export async function resolveRoomContext(input: {
  userId: string
  officeId: string
  meetingId?: string
  presentUserIds?: string[]
  transcriptTail?: string
  deps: RoomContextDeps
}): Promise<RoomContext | null> {
  const { userId, officeId, meetingId, presentUserIds, transcriptTail, deps } = input

  if (!officeId || !await deps.isMember(officeId, userId)) return null

  const officeName = await deps.getOfficeName(officeId)
  if (!officeName) return null

  const ids = (presentUserIds ?? [])
    .filter(id => typeof id === 'string' && id.length > 0)
    .slice(0, 50)
  const presentUsers = ids.length ? await deps.resolvePresentUsers(officeId, ids) : []

  return { officeId, officeName, meetingId, presentUsers, transcriptTail }
}

/** Real DB-backed deps for the engine. The membership + co-member joins are the security boundary. */
export function dbRoomContextDeps(): RoomContextDeps {
  return {
    async isMember(officeId, userId) {
      const row = await queryOne(
        `SELECT 1 FROM office_members WHERE office_id = $1 AND user_id = $2`,
        [officeId, userId],
      )
      return !!row
    },
    async getOfficeName(officeId) {
      const row = await queryOne<{ name: string }>(
        `SELECT name FROM offices WHERE id = $1`,
        [officeId],
      )
      return row?.name ?? null
    },
    async resolvePresentUsers(officeId, userIds) {
      if (!userIds.length) return []
      // JOIN to office_members so only co-members of THIS office are ever named — a foreign/spoofed
      // id supplied by the client simply doesn't match and is dropped.
      const rows = await queryRows<{ id: string, name: string }>(
        `SELECT tm.id, tm.name
         FROM team_members tm
         JOIN office_members om ON om.user_id = tm.id
         WHERE om.office_id = $1 AND tm.id = ANY($2)`,
        [officeId, userIds],
      )
      return rows.map(r => ({ id: r.id, name: r.name }))
    },
  }
}
