import { describe, expect, it } from 'vitest'
import {
  CRM_RECORD_ACCESS_SURFACE_INVENTORY,
  discoverCrmInventoryDrift,
  discoverCrmIndirectServiceSurfaces,
  discoverRegisteredCrmToolSurfaces,
  scanCrmRecordSurfaces
} from '~~/server/utils/crm/recordAccessInventory'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('CRM record authorization inventory', () => {
  it('classifies every record-bearing CRM route and registered service and rejects drift', () => {
    expect(scanCrmRecordSurfaces()).toEqual([...CRM_RECORD_ACCESS_SURFACE_INVENTORY].sort())
  })

  it('includes the indirect CRM writers and readers that bypass the public route namespace', () => {
    expect(CRM_RECORD_ACCESS_SURFACE_INVENTORY).toEqual(expect.arrayContaining([
      'tool:search_crm',
      'tool:get_crm_pipeline',
      'service:workers/crm-cron/src/index.ts',
      'service:workers/email-worker/src/crmAdapter.ts',
      'service:server/utils/leads/crmPromotion.ts'
    ]))
  })

  it('discovers newly registered CRM tools rather than accepting a static tool entry', () => {
    const tools = discoverRegisteredCrmToolSurfaces([
      { name: 'search_crm', description: 'Search CRM records' },
      { name: 'new_crm_reader', description: 'Read CRM records introduced after the inventory snapshot' }
    ])

    expect(tools).toContain('tool:new_crm_reader')
    expect(discoverCrmInventoryDrift(tools, CRM_RECORD_ACCESS_SURFACE_INVENTORY).unclassified)
      .toContain('tool:new_crm_reader')
  })

  it('discovers a new indirect CRM service and reports both additions and manifest omissions', () => {
    const root = mkdtempSync(join(tmpdir(), 'crm-inventory-'))
    const serviceDirectory = join(root, 'server/utils/leads')
    mkdirSync(serviceDirectory, { recursive: true })
    writeFileSync(join(serviceDirectory, 'crm-new-writer.ts'), 'export {}')

    const discovered = discoverCrmIndirectServiceSurfaces(root)
    expect(discovered).toContain('service:server/utils/leads/crm-new-writer.ts')

    const drift = discoverCrmInventoryDrift([
      ...CRM_RECORD_ACCESS_SURFACE_INVENTORY.slice(1),
      ...discovered
    ], CRM_RECORD_ACCESS_SURFACE_INVENTORY)
    expect(drift.unclassified).toContain('service:server/utils/leads/crm-new-writer.ts')
    expect(drift.missing).toHaveLength(1)
  })
})
