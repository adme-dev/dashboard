import type { H3Event } from 'h3'
import type { OfficeZoneRow } from '~~/app/types/office'
import { getOfficeRoom } from './officeRoom'

export async function notifyOfficeZoneUpserted(event: H3Event, officeId: string, zone: OfficeZoneRow) {
  try {
    const room = getOfficeRoom(event, officeId)
    await room.fetch(new Request('https://office-room-do/admin/zone-upserted', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ zoneId: zone.id, zone })
    }))
  } catch {
    // Local dev often lacks a DO binding; persisted office data remains authoritative.
  }
}

export async function notifyOfficeZoneDeleted(event: H3Event, officeId: string, zoneId: string) {
  try {
    const room = getOfficeRoom(event, officeId)
    await room.fetch(new Request('https://office-room-do/admin/zone-deleted', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ zoneId })
    }))
  } catch {
    // Local dev often lacks a DO binding; persisted office data remains authoritative.
  }
}
