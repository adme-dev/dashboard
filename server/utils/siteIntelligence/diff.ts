import type { AutomotivePageFacts, SiteIntelligenceFactDiff } from '~~/app/types/site-intelligence'
import type { AutomotiveFactEvidence } from '~~/server/utils/siteIntelligence/extractAutomotiveFacts'

export type AutomotiveFactDiff = SiteIntelligenceFactDiff

interface DiffOptions {
  previousEvidence?: AutomotiveFactEvidence[]
  currentEvidence?: AutomotiveFactEvidence[]
}

const MATERIAL_FIELDS = [
  'brand',
  'bodyType',
  'ctas',
  'disclaimers',
  'discount',
  'driveAwayPrice',
  'expiry',
  'finance.balloon',
  'finance.comparisonRate',
  'finance.deposit',
  'finance.eligibility',
  'finance.repayment',
  'finance.repaymentPeriod',
  'finance.termMonths',
  'listPrice',
  'model',
  'modelYear',
  'offerTypes',
  'pageType',
  'powertrain',
  'stockState',
  'variant'
] as const

export function diffAutomotiveFacts(
  previous: Partial<AutomotivePageFacts> | null,
  current: Partial<AutomotivePageFacts>,
  options: DiffOptions = {}
): AutomotiveFactDiff {
  const changedFields = MATERIAL_FIELDS.filter(field => (
    scalarValue(readPath(previous, field)) !== scalarValue(readPath(current, field))
  )).sort()
  const before: Record<string, string | number | boolean | null> = {}
  const after: Record<string, string | number | boolean | null> = {}

  for (const field of changedFields) {
    before[field] = scalarValue(readPath(previous, field))
    after[field] = scalarValue(readPath(current, field))
  }

  const evidence = changedFields
    .flatMap((field) => {
      const current = (options.currentEvidence ?? []).filter(item => item.field === field)
      const selected = current.length
        ? current
        : (options.previousEvidence ?? []).filter(item => item.field === field)
      return selected.map(item => ({ field, excerpt: item.excerpt.slice(0, 240) }))
    })
    .sort((left, right) => left.field.localeCompare(right.field) || left.excerpt.localeCompare(right.excerpt))

  return {
    material: changedFields.length > 0,
    changedFields,
    before,
    after,
    evidence
  }
}

function readPath(input: Partial<AutomotivePageFacts> | null, path: string): unknown {
  if (!input) return null
  const [parent, child] = path.split('.')
  if (!child) return input[parent as keyof AutomotivePageFacts] ?? null
  const nested = input[parent as keyof AutomotivePageFacts]
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return null
  return (nested as unknown as Record<string, unknown>)[child] ?? null
}

function scalarValue(input: unknown): string | number | boolean | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') return input
  if (Array.isArray(input)) return JSON.stringify([...input].map(String).sort())
  return JSON.stringify(input)
}
