/** Pure display helpers for the campaign health verdict. No Nuxt/DOM deps. */
export type HealthVerdict = 'scale' | 'hold' | 'cut' | 'insufficient' | 'no-target'

export function healthColor(verdict: HealthVerdict): 'success' | 'warning' | 'error' | 'neutral' {
  if (verdict === 'scale') return 'success'
  if (verdict === 'hold') return 'warning'
  if (verdict === 'cut') return 'error'
  return 'neutral'
}

export function healthLabel(verdict: HealthVerdict): string {
  switch (verdict) {
    case 'scale': return 'Scale'
    case 'hold': return 'Hold'
    case 'cut': return 'Cut'
    case 'insufficient': return 'Low data'
    case 'no-target': return 'Set target'
  }
}
