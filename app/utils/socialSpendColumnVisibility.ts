export const SOCIAL_SPEND_OPTIONAL_COLUMNS = [
  { id: 'health', label: 'Health' },
  { id: 'owner', label: 'Owner' },
  { id: 'budgetControl', label: 'Budget control' },
  { id: 'reasonCodes', label: 'Reason codes' },
  { id: 'bankCharged', label: 'Bank charged' },
  { id: 'aiPacing', label: 'AI pacing' },
  { id: 'pacing', label: 'Pacing' },
  { id: 'projectedMonthEnd', label: 'Projected' },
  { id: 'lastAction', label: 'Last action' },
  { id: 'commission', label: 'Commission' },
  { id: 'variance', label: 'Variance' },
  { id: 'variancePercent', label: 'Var %' },
] as const

const FIXED_COLUMN_IDS = ['client', 'platform', 'budget', 'spend'] as const

export type SocialSpendOptionalColumnId = typeof SOCIAL_SPEND_OPTIONAL_COLUMNS[number]['id']
export type SocialSpendColumnId = typeof FIXED_COLUMN_IDS[number] | SocialSpendOptionalColumnId
export type SocialSpendColumnVisibility = Record<SocialSpendOptionalColumnId, boolean>
export type SocialSpendViewPresetId = 'pacing' | 'performance' | 'finance' | 'ops'

export const SOCIAL_SPEND_VIEW_PRESETS: Array<{ id: SocialSpendViewPresetId, label: string }> = [
  { id: 'pacing', label: 'Pacing' },
  { id: 'performance', label: 'Performance' },
  { id: 'finance', label: 'Finance' },
  { id: 'ops', label: 'Ops' },
]

export function defaultSocialSpendColumnVisibility(): SocialSpendColumnVisibility {
  return {
    health: true,
    owner: true,
    budgetControl: true,
    reasonCodes: true,
    bankCharged: true,
    aiPacing: true,
    pacing: true,
    projectedMonthEnd: true,
    lastAction: true,
    commission: false,
    variance: true,
    variancePercent: true,
  }
}

export function socialSpendPresetVisibility(preset: SocialSpendViewPresetId): SocialSpendColumnVisibility {
  const defaults = defaultSocialSpendColumnVisibility()
  if (preset === 'finance') {
    return {
      ...defaults,
      health: true,
      owner: false,
      budgetControl: false,
      reasonCodes: false,
      bankCharged: true,
      aiPacing: false,
      pacing: false,
      projectedMonthEnd: true,
      lastAction: false,
      commission: true,
      variance: true,
      variancePercent: true,
    }
  }
  if (preset === 'performance') {
    return {
      ...defaults,
      health: true,
      owner: false,
      budgetControl: false,
      reasonCodes: true,
      bankCharged: false,
      aiPacing: true,
      pacing: true,
      projectedMonthEnd: true,
      lastAction: true,
      commission: false,
      variance: false,
      variancePercent: true,
    }
  }
  if (preset === 'ops') {
    return {
      ...defaults,
      health: true,
      owner: true,
      budgetControl: true,
      reasonCodes: true,
      bankCharged: false,
      aiPacing: true,
      pacing: false,
      projectedMonthEnd: false,
      lastAction: true,
      commission: false,
      variance: true,
      variancePercent: false,
    }
  }
  return defaults
}

export function normalizeSocialSpendColumnVisibility(
  visibility: Partial<Record<string, boolean>> | null | undefined,
): SocialSpendColumnVisibility {
  const defaults = defaultSocialSpendColumnVisibility()
  if (!visibility) return defaults

  return SOCIAL_SPEND_OPTIONAL_COLUMNS.reduce((acc, column) => {
    acc[column.id] = typeof visibility[column.id] === 'boolean' ? visibility[column.id] : defaults[column.id]
    return acc
  }, { ...defaults })
}

export function socialSpendVisibleColumnIds(options: {
  hasBankData: boolean
  visibility: SocialSpendColumnVisibility
}): SocialSpendColumnId[] {
  const optional = SOCIAL_SPEND_OPTIONAL_COLUMNS
    .filter(column => column.id !== 'bankCharged' || options.hasBankData)
    .filter(column => options.visibility[column.id])
    .map(column => column.id)

  return [...FIXED_COLUMN_IDS, ...optional]
}

export function socialSpendColumnCount(options: {
  hasBankData: boolean
  visibility: SocialSpendColumnVisibility
}): number {
  return socialSpendVisibleColumnIds(options).length
}
