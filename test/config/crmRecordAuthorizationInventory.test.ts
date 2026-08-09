import { describe, expect, it } from 'vitest'
import {
  CRM_RECORD_ACCESS_SURFACE_INVENTORY,
  scanCrmRecordSurfaces
} from '~~/server/utils/crm/recordAccessInventory'

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
})
