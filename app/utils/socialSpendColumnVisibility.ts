export const SOCIAL_SPEND_OPTIONAL_COLUMNS = [
  { id: 'bankCharged', label: 'Bank charged' },
  { id: 'aiPacing', label: 'AI pacing' },
  { id: 'pacing', label: 'Pacing' },
  { id: 'commission', label: 'Commission' },
  { id: 'variance', label: 'Variance' },
  { id: 'variancePercent', label: 'Var %' },
] as const

const FIXED_COLUMN_IDS = ['client', 'platform', 'budget', 'spend'] as const

export type SocialSpendOptionalColumnId = typeof SOCIAL_SPEND_OPTIONAL_COLUMNS[number]['id']
export type SocialSpendColumnId = typeof FIXED_COLUMN_IDS[number] | SocialSpendOptionalColumnId
export type SocialSpendColumnVisibility = Record<SocialSpendOptionalColumnId, boolean>

export function defaultSocialSpendColumnVisibility(): SocialSpendColumnVisibility {
  return {
    bankCharged: true,
    aiPacing: true,
    pacing: true,
    commission: false,
    variance: true,
    variancePercent: true,
  }
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
