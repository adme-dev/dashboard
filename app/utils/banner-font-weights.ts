import { FONT_WEIGHTS } from './banner-constants'

/** Keep exact imported weights selectable, including before the catalog loads. */
export function bannerFontWeightOptions(available: number[] = [], current?: number) {
  const weights = new Set<number>(FONT_WEIGHTS.map(item => item.value))
  for (const weight of [...available, current]) {
    if (typeof weight === 'number' && Number.isInteger(weight) && weight >= 1 && weight <= 1000) weights.add(weight)
  }
  return [...weights].sort((a, b) => a - b).map(weight => ({
    label: FONT_WEIGHTS.find(item => item.value === weight)?.label ?? String(weight),
    value: String(weight)
  }))
}
