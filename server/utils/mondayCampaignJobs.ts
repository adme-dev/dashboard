import type { MondayColumn, MondayItem } from './mondayClient'

export const MONDAY_MARKETING_BOARD_ID = '13392458'

export const MONDAY_CAMPAIGN_COLUMNS = {
  client: 'dropdown93',
  status: 'status0',
  dueDate: 'due_date5',
  campaignId: 'text_mm67hxk4',
  campaignEndDate: 'date_mm67aq9h',
  campaignUrl: 'text_mm67npts',
  platform: 'dropdown_mm1m5vxy',
  campaignType: 'dropdown_mm1m4gkk',
  budget: 'numeric'
} as const

export interface MondayCampaignSnapshot {
  mondayItemId: string
  mondayBoardId: string
  name: string
  groupId: string
  groupTitle: string
  clientLabel: string
  sourceStatus: string
  platform: 'Google' | 'Meta'
  campaignType: string
  budget: number | null
  dueDate: string | null
  campaignEndDate: string | null
  campaignId: string | null
  campaignUrl: string | null
  createdAt: string
  updatedAt: string
  sourceItem: MondayItem
  columns: MondayColumn[]
}

const TERMINAL_STATUSES = new Set(['done', 'complete', 'completed', 'finished', 'cancelled', 'canceled'])

function columnText(item: MondayItem, id: string): string {
  return String(item.column_values?.find(value => value.id === id)?.text || '').trim()
}

export function selectActiveMondayCampaignJobs(items: MondayItem[]): MondayItem[] {
  return items.filter((item) => {
    if (item.state !== 'active') return false
    if (/completed/i.test(String(item.group_title || ''))) return false

    const platform = columnText(item, MONDAY_CAMPAIGN_COLUMNS.platform).toLowerCase()
    if (platform !== 'google' && platform !== 'meta') return false

    const status = columnText(item, MONDAY_CAMPAIGN_COLUMNS.status).toLowerCase()
    return !TERMINAL_STATUSES.has(status)
  })
}

export function toXeroFlowCampaignStatus(sourceStatus: string): string {
  const normalized = sourceStatus.trim().toLowerCase()
  if (normalized === 'awaiting approval') return 'Client Review'
  if (normalized === 'review required' || normalized === 'qa' || normalized === 'qa new campaign') {
    return 'Internal Review'
  }
  if (normalized === 'feed requested' || normalized === 'ac mgr: follow up') return 'In Progress'
  return 'To Do'
}

export function canReuseMondayCampaignProject(taskCount: number): boolean {
  return Number.isInteger(taskCount) && taskCount >= 0 && taskCount <= 1
}

function normalizedClientName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Strict Monday-to-Xero contact matching. A score is returned only for an exact
 * case-insensitive/normalized match, plus the known dealer-name suffix "Haval".
 */
export function mondayClientMatchScore(mondayLabel: string, xeroName: string): number | null {
  const monday = mondayLabel.trim().toLowerCase()
  const xero = xeroName.trim().toLowerCase()
  if (!monday || !xero) return null
  if (monday === xero) return 0

  const normalizedMonday = normalizedClientName(mondayLabel)
  const normalizedXero = normalizedClientName(xeroName)
  if (normalizedMonday === normalizedXero) return 1
  if (`${normalizedMonday}haval` === normalizedXero || `${normalizedXero}haval` === normalizedMonday) return 2
  return null
}

function optionalText(value: string): string | null {
  return value || null
}

export function buildMondayCampaignSnapshot(
  item: MondayItem,
  columns: MondayColumn[]
): MondayCampaignSnapshot {
  const platform = columnText(item, MONDAY_CAMPAIGN_COLUMNS.platform)
  if (platform !== 'Google' && platform !== 'Meta') {
    throw new Error(`Monday item ${item.id} has unsupported campaign platform`)
  }

  const rawBudget = columnText(item, MONDAY_CAMPAIGN_COLUMNS.budget)
  const parsedBudget = rawBudget ? Number(rawBudget) : null

  return {
    mondayItemId: String(item.id),
    mondayBoardId: String(item.board_id),
    name: String(item.name || '').trim(),
    groupId: String(item.group_id || ''),
    groupTitle: String(item.group_title || ''),
    clientLabel: columnText(item, MONDAY_CAMPAIGN_COLUMNS.client),
    sourceStatus: columnText(item, MONDAY_CAMPAIGN_COLUMNS.status),
    platform,
    campaignType: columnText(item, MONDAY_CAMPAIGN_COLUMNS.campaignType),
    budget: parsedBudget !== null && Number.isFinite(parsedBudget) ? parsedBudget : null,
    dueDate: optionalText(columnText(item, MONDAY_CAMPAIGN_COLUMNS.dueDate)),
    campaignEndDate: optionalText(columnText(item, MONDAY_CAMPAIGN_COLUMNS.campaignEndDate)),
    campaignId: optionalText(columnText(item, MONDAY_CAMPAIGN_COLUMNS.campaignId)),
    campaignUrl: optionalText(columnText(item, MONDAY_CAMPAIGN_COLUMNS.campaignUrl)),
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    sourceItem: item,
    columns
  }
}

export function assertMondayCampaignBoardColumns(columns: MondayColumn[]): void {
  const byId = new Map(columns.map(column => [column.id, column]))
  const required = [
    [MONDAY_CAMPAIGN_COLUMNS.client, '#Client', 'dropdown'],
    [MONDAY_CAMPAIGN_COLUMNS.status, 'Status', 'status'],
    [MONDAY_CAMPAIGN_COLUMNS.platform, 'Platform', 'dropdown'],
    [MONDAY_CAMPAIGN_COLUMNS.campaignType, 'Campaign Type', 'dropdown'],
    [MONDAY_CAMPAIGN_COLUMNS.budget, 'Client Budget', 'numbers']
  ] as const

  for (const [id, title, type] of required) {
    const column = byId.get(id)
    if (!column || column.title !== title || column.type !== type) {
      throw new Error(`Monday Marketing column ${id} must remain ${title} (${type})`)
    }
  }
}
