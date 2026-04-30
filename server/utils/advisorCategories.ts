/**
 * Fixed taxonomy of advisor recommendation categories.
 *
 * The LLM prompt instructs Groq to emit one of these values per
 * recommendation when confident; manual recs set their own. NULL is
 * rendered as "Uncategorized" in the UI. Treat this list as
 * append-only — removing a value would orphan existing rows and
 * require a migration.
 */
export const CATEGORIES = [
  'cashflow',
  'collections',
  'pricing',
  'margin',
  'cost-control',
  'growth',
  'staffing',
  'tax-compliance',
  'risk',
] as const

export type Category = typeof CATEGORIES[number]

export const CATEGORY_LABELS: Record<Category, string> = {
  cashflow: 'Cashflow',
  collections: 'Collections',
  pricing: 'Pricing',
  margin: 'Margin',
  'cost-control': 'Cost control',
  growth: 'Growth',
  staffing: 'Staffing',
  'tax-compliance': 'Tax & compliance',
  risk: 'Risk',
}

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)
}
