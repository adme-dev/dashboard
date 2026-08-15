import { describe, expect, it } from 'vitest'
import type { MondayColumn, MondayItem } from '../../../server/utils/mondayClient'
import {
  buildMondayCampaignSnapshot,
  canReuseMondayCampaignProject,
  mondayClientMatchScore,
  selectActiveMondayCampaignJobs,
  toXeroFlowCampaignStatus
} from '../../../server/utils/mondayCampaignJobs'

const columns: MondayColumn[] = [
  { id: 'dropdown93', title: '#Client', type: 'dropdown' },
  { id: 'status0', title: 'Status', type: 'status' },
  { id: 'due_date5', title: 'Due Date', type: 'date' },
  { id: 'dropdown_mm1m5vxy', title: 'Platform', type: 'dropdown' },
  { id: 'dropdown_mm1m4gkk', title: 'Campaign Type', type: 'dropdown' },
  { id: 'numeric', title: 'Client Budget', type: 'numbers' }
]

function item(overrides: Partial<MondayItem> = {}): MondayItem {
  return {
    id: '12791124884',
    name: 'Geelong GWM Meta AIA Used Cars',
    board_id: '13392458',
    state: 'active',
    created_at: '2026-08-14T07:00:00Z',
    updated_at: '2026-08-14T07:37:19Z',
    group_id: 'new_group46029',
    group_title: 'Items to Action',
    column_values: [
      { id: 'dropdown93', type: 'dropdown', text: 'Geelong GWM', value: null },
      { id: 'status0', type: 'status', text: 'Feed Requested', value: null },
      { id: 'due_date5', type: 'date', text: '2026-08-17', value: '{"date":"2026-08-17"}' },
      { id: 'dropdown_mm1m5vxy', type: 'dropdown', text: 'Meta', value: null },
      { id: 'dropdown_mm1m4gkk', type: 'dropdown', text: 'M_AIA_Traffic', value: null },
      { id: 'numeric', type: 'numbers', text: '500', value: '"500"' }
    ],
    ...overrides
  }
}

describe('Monday campaign job reconciliation', () => {
  it('selects active Google and Meta work while excluding completed or terminal work', () => {
    const selected = selectActiveMondayCampaignJobs([
      item(),
      item({ id: '2', name: 'Google PMax', column_values: [
        { id: 'status0', type: 'status', text: 'QA', value: null },
        { id: 'dropdown_mm1m5vxy', type: 'dropdown', text: 'Google', value: null }
      ] }),
      item({ id: '3', group_title: 'Meta Completed August' }),
      item({ id: '4', column_values: [
        { id: 'status0', type: 'status', text: 'Done', value: null },
        { id: 'dropdown_mm1m5vxy', type: 'dropdown', text: 'Meta', value: null }
      ] }),
      item({ id: '5', column_values: [
        { id: 'status0', type: 'status', text: 'In Progress', value: null },
        { id: 'dropdown_mm1m5vxy', type: 'dropdown', text: 'TikTok', value: null }
      ] })
    ])

    expect(selected.map(job => job.id)).toEqual(['12791124884', '2'])
  })

  it('builds a provenance-complete campaign snapshot from governed column ids', () => {
    expect(buildMondayCampaignSnapshot(item(), columns)).toEqual(expect.objectContaining({
      mondayItemId: '12791124884',
      mondayBoardId: '13392458',
      groupId: 'new_group46029',
      groupTitle: 'Items to Action',
      clientLabel: 'Geelong GWM',
      sourceStatus: 'Feed Requested',
      platform: 'Meta',
      campaignType: 'M_AIA_Traffic',
      budget: 500,
      dueDate: '2026-08-17'
    }))
  })

  it.each([
    ['Feed Requested', 'In Progress'],
    ['Ac Mgr: Follow Up', 'In Progress'],
    ['Review Required', 'Internal Review'],
    ['QA New Campaign', 'Internal Review'],
    ['QA', 'Internal Review'],
    ['Awaiting Approval', 'Client Review']
  ])('maps Monday status %s to XeroFlow status %s', (source, target) => {
    expect(toXeroFlowCampaignStatus(source)).toBe(target)
  })

  it('matches campaign clients to Xero without broad fuzzy aliases', () => {
    expect(mondayClientMatchScore('Geelong GWM', 'Geelong GWM Haval')).toBe(2)
    expect(mondayClientMatchScore('Northern Kia', 'Northern KIA')).toBe(0)
    expect(mondayClientMatchScore('South Morang Omoda Jaecoo', 'South Morang Omoda Jaecoo')).toBe(0)
    expect(mondayClientMatchScore('Northern Motor Group', 'Northern Motor Group Service (415)')).toBeNull()
  })

  it('never repurposes a project shared by other tasks', () => {
    expect(canReuseMondayCampaignProject(1)).toBe(true)
    expect(canReuseMondayCampaignProject(18)).toBe(false)
  })
})
