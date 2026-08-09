import { describe, expect, it } from 'vitest'
import {
  CRM_RECORD_ACCESS_SURFACE_INVENTORY,
  discoverCrmExternalRouteSurfaces,
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
      'route:server/api/internal/workflows/crm/followup-review.post.ts',
      'route:server/api/office/[officeId]/meetings/[meetingId]/action-items/[actionItemId]/crm-candidates.get.ts',
      'route:server/api/office/[officeId]/meetings/[meetingId]/action-items/[actionItemId]/crm-task.post.ts',
      'tool:search_crm',
      'tool:get_crm_pipeline',
      'service:server/utils/crm/recordAccess.ts',
      'service:workers/crm-cron/src/index.ts',
      'service:workers/email-worker/src/crmAdapter.ts',
      'service:server/utils/leads/crmPromotion.ts'
    ]))
  })

  it('recursively discovers only CRM-bearing routes in the reviewed external route roots', () => {
    const root = mkdtempSync(join(tmpdir(), 'crm-external-routes-'))
    const actionItemDirectory = join(root, 'server/api/office/[officeId]/meetings/[meetingId]/action-items/[actionItemId]')
    const workflowDirectory = join(root, 'server/api/internal/workflows/crm/nested')
    mkdirSync(actionItemDirectory, { recursive: true })
    mkdirSync(workflowDirectory, { recursive: true })
    writeFileSync(join(actionItemDirectory, 'crm-new-writer.post.ts'), 'export {}')
    writeFileSync(join(actionItemDirectory, 'task.post.ts'), 'export {}')
    writeFileSync(join(workflowDirectory, 'new-review.post.ts'), 'export {}')

    expect(discoverCrmExternalRouteSurfaces(root)).toEqual([
      'route:server/api/internal/workflows/crm/nested/new-review.post.ts',
      'route:server/api/office/[officeId]/meetings/[meetingId]/action-items/[actionItemId]/crm-new-writer.post.ts'
    ])
  })

  it('reports external CRM route additions and reviewed-route omissions as drift', () => {
    const root = mkdtempSync(join(tmpdir(), 'crm-external-route-drift-'))
    const actionItemDirectory = join(root, 'server/api/office/o/meetings/m/action-items/a')
    mkdirSync(actionItemDirectory, { recursive: true })
    writeFileSync(join(actionItemDirectory, 'crm-new-reader.get.ts'), 'export {}')

    const discovered = discoverCrmExternalRouteSurfaces(root)
    const reviewed = ['route:server/api/office/o/meetings/m/action-items/a/crm-reviewed.get.ts']
    const drift = discoverCrmInventoryDrift(discovered, reviewed)

    expect(drift.unclassified).toEqual([
      'route:server/api/office/o/meetings/m/action-items/a/crm-new-reader.get.ts'
    ])
    expect(drift.missing).toEqual([
      'route:server/api/office/o/meetings/m/action-items/a/crm-reviewed.get.ts'
    ])
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

  it('treats runtime CRM tool additions and reviewed-tool omissions as inventory drift', () => {
    const runtimeTools = [
      { name: 'search_crm', description: 'Search CRM records' },
      { name: 'get_crm_pipeline', description: 'Read CRM pipeline totals' },
      { name: 'propose_opportunity', description: 'Prepare a CRM opportunity' },
      { name: 'log_crm_activity', description: 'Prepare a CRM activity' },
      { name: 'propose_quote', description: 'Prepare a CRM quote' },
      { name: 'draft_followup', description: 'Draft a CRM follow-up' },
      { name: 'new_crm_reader', description: 'Read CRM records introduced after review' }
    ]

    const additionDrift = discoverCrmInventoryDrift(
      scanCrmRecordSurfaces(process.cwd(), runtimeTools),
      CRM_RECORD_ACCESS_SURFACE_INVENTORY
    )
    expect(additionDrift.unclassified).toContain('tool:new_crm_reader')

    const omissionDrift = discoverCrmInventoryDrift(
      scanCrmRecordSurfaces(process.cwd(), []),
      CRM_RECORD_ACCESS_SURFACE_INVENTORY
    )
    expect(omissionDrift.missing).toEqual(expect.arrayContaining([
      'tool:search_crm',
      'tool:get_crm_pipeline'
    ]))
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

  it('recursively discovers nested CRM engines and reports nested additions and omissions', () => {
    const root = mkdtempSync(join(tmpdir(), 'crm-inventory-nested-'))
    const engineDirectory = join(root, 'server/utils/crm/engine')
    mkdirSync(engineDirectory, { recursive: true })
    writeFileSync(join(engineDirectory, 'recordFilter.ts'), 'export {}')
    writeFileSync(join(engineDirectory, 'new-record-writer.ts'), 'export {}')

    const discovered = discoverCrmIndirectServiceSurfaces(root)
    const reviewed = ['service:server/utils/crm/engine/recordFilter.ts']
    const drift = discoverCrmInventoryDrift(discovered, reviewed)

    expect(discovered).toEqual(expect.arrayContaining([
      'service:server/utils/crm/engine/recordFilter.ts',
      'service:server/utils/crm/engine/new-record-writer.ts'
    ]))
    expect(drift.unclassified).toContain('service:server/utils/crm/engine/new-record-writer.ts')

    const omission = discoverCrmInventoryDrift([], reviewed)
    expect(omission.missing).toContain('service:server/utils/crm/engine/recordFilter.ts')
  })
})
