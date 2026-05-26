import { describe, expect, it } from 'vitest'
import type { OfficeZoneRow } from '~~/app/types/office'
import { mergeOfficeLiveZones } from '~~/app/utils/officeZones'

function zone(id: string, name = id): OfficeZoneRow {
  return {
    id,
    office_id: 'office-1',
    slug: id,
    name,
    zone_type: 'meeting',
    position: { x: 0, y: 0, w: 100, h: 100 },
    capacity: 8,
    is_private: false,
    acl: {},
    notes: '',
    notes_version: 0,
    notes_updated_at: null,
    notes_updated_by: null,
    created_at: '2026-05-26T00:00:00.000Z'
  }
}

describe('mergeOfficeLiveZones', () => {
  it('upserts existing zones and appends new live zones', () => {
    expect(mergeOfficeLiveZones({
      zones: [zone('zone-1', 'Original')],
      upsertedZones: {
        'zone-1': zone('zone-1', 'Renamed'),
        'zone-2': zone('zone-2', 'New Room')
      },
      deletedZoneIds: new Set(),
      zoneNoteUpdates: {}
    }).map(item => [item.id, item.name])).toEqual([
      ['zone-1', 'Renamed'],
      ['zone-2', 'New Room']
    ])
  })

  it('filters deleted zones from server and live upsert sources', () => {
    expect(mergeOfficeLiveZones({
      zones: [zone('zone-1'), zone('zone-2')],
      upsertedZones: {
        'zone-2': zone('zone-2', 'Updated'),
        'zone-3': zone('zone-3', 'Live Deleted')
      },
      deletedZoneIds: new Set(['zone-2', 'zone-3']),
      zoneNoteUpdates: {}
    }).map(item => item.id)).toEqual(['zone-1'])
  })

  it('applies live note updates after room upserts', () => {
    expect(mergeOfficeLiveZones({
      zones: [zone('zone-1')],
      upsertedZones: {
        'zone-1': zone('zone-1', 'Renamed')
      },
      deletedZoneIds: new Set(),
      zoneNoteUpdates: {
        'zone-1': {
          notes: 'Live notes',
          notes_version: 2,
          notes_updated_at: '2026-05-26T01:00:00.000Z',
          notes_updated_by: 'Paul'
        }
      }
    })[0]).toMatchObject({
      id: 'zone-1',
      name: 'Renamed',
      notes: 'Live notes',
      notes_version: 2
    })
  })
})
