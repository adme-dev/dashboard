import { queryOne, queryRows } from '~~/server/utils/db'
import type { OfficeZoneRow } from '~~/app/types/office'

export interface DeskGridConfig {
  cellWidth: number
  cellHeight: number
  colsPerRow: number
  gridOriginY: number
}

export const DEFAULT_DESK_GRID: DeskGridConfig = {
  cellWidth: 96,
  cellHeight: 76,
  colsPerRow: 8,
  gridOriginY: 600,
}

export interface ComputeNextArgs extends DeskGridConfig {
  existingDesks: Array<{ x: number; y: number }>
}

export function computeNextDeskPosition(args: ComputeNextArgs): { x: number; y: number } {
  const taken = new Set<string>()
  for (const d of args.existingDesks) {
    const col = Math.round(d.x / args.cellWidth)
    const row = Math.round((d.y - args.gridOriginY) / args.cellHeight)
    taken.add(`${col},${row}`)
  }

  const MAX_ROWS = 1000 // safety: 8 cols × 1000 rows = 8000 desks is way beyond agency scale
  for (let row = 0; row < MAX_ROWS; row++) {
    for (let col = 0; col < args.colsPerRow; col++) {
      if (!taken.has(`${col},${row}`)) {
        return {
          x: col * args.cellWidth,
          y: args.gridOriginY + row * args.cellHeight,
        }
      }
    }
  }
  throw new Error(`computeNextDeskPosition: grid exhausted (>${MAX_ROWS} rows)`)
}

export async function allocateDesk(
  officeId: string,
  userId: string,
  grid: DeskGridConfig = DEFAULT_DESK_GRID,
): Promise<OfficeZoneRow> {
  const existing = await queryOne<OfficeZoneRow>(
    `SELECT * FROM office_zones
       WHERE office_id = $1 AND zone_type = 'desk' AND assigned_user_id = $2`,
    [officeId, userId],
  )
  if (existing) return existing

  const member = await queryOne<{ name: string }>(
    `SELECT name FROM team_members WHERE id = $1`,
    [userId],
  )
  const label = member?.name ? `${member.name}'s desk` : 'Desk'

  const existingDesks = await queryRows<{ x: number; y: number }>(
    `SELECT x, y FROM office_zones
       WHERE office_id = $1 AND zone_type = 'desk'`,
    [officeId],
  )
  const pos = computeNextDeskPosition({ existingDesks, ...grid })

  // Desks are 80×60 inside 96×76 grid cells — 16px gap on each axis
  // keeps them visually separated on the floor plan.
  const created = await queryOne<OfficeZoneRow>(
    `INSERT INTO office_zones
       (office_id, name, zone_type, capacity, x, y, width, height,
        assigned_user_id, cf_preset_default)
     VALUES ($1, $2, 'desk', 1, $3, $4, 80, 60, $5, NULL)
     RETURNING *`,
    [officeId, label, pos.x, pos.y, userId],
  )
  if (!created) throw new Error('allocateDesk: insert returned no row')
  return created
}
