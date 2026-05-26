import type { OfficeZoneRow } from '~~/app/types/office'

type ZoneNotesUpdate = Pick<OfficeZoneRow, 'notes' | 'notes_version' | 'notes_updated_at' | 'notes_updated_by'>

export function mergeOfficeLiveZones(input: {
  zones: OfficeZoneRow[]
  upsertedZones: Record<string, OfficeZoneRow>
  deletedZoneIds: Set<string>
  zoneNoteUpdates: Record<string, ZoneNotesUpdate>
}) {
  const serverIds = new Set(input.zones.map(zone => zone.id))
  const merged = [
    ...input.zones,
    ...Object.values(input.upsertedZones).filter(zone => !serverIds.has(zone.id))
  ]

  return merged
    .filter(zone => !input.deletedZoneIds.has(zone.id))
    .map((zone) => {
      const liveZone = input.upsertedZones[zone.id] ?? zone
      const notes = input.zoneNoteUpdates[zone.id]
      return notes ? { ...liveZone, ...notes } : liveZone
    })
}
