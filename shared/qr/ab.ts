import { z } from 'zod'

/**
 * A/B destinations: one printed code, two landing URLs. Assignment is hashed from the scan's
 * daily IP hash so the same person sees one arm all day; the arm rides on the redirect as
 * `xf_qr_variant` so leads can be attributed back to it.
 */
const HTTP_URL = z.string().trim().url().max(2048).refine(u => /^https?:\/\//i.test(u), 'Must be an http(s) URL')
export const QR_VARIANT_PARAM = 'xf_qr_variant'
export type QrVariant = 'A' | 'B'

export const QrAbSchema = z.object({
  enabled: z.boolean().default(false),
  variant_b_url: HTTP_URL.nullable().default(null),
  /** Percentage of scans sent to B. */
  split_pct: z.number().int().min(0).max(100).default(50)
})
export type QrAb = z.infer<typeof QrAbSchema>
export const DEFAULT_AB: QrAb = QrAbSchema.parse({})

/** Deterministic arm for a seed (daily IP hash); random when there is no seed. */
export function pickVariant(seed: string | null | undefined, splitPct: number, random: () => number = Math.random): QrVariant {
  const pct = Math.max(0, Math.min(100, splitPct))
  let bucket: number
  if (seed) {
    let h = 2166136261
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i)
      h = Math.imul(h, 16777619) >>> 0
    }
    bucket = h % 100
  } else {
    bucket = Math.floor(random() * 100)
  }
  return bucket < pct ? 'B' : 'A'
}

export interface ArmStats { scans: number, leads: number }
export interface AbTest {
  rateA: number
  rateB: number
  /** Relative lift of B over A (null when A has no conversions). */
  lift: number | null
  z: number | null
  p: number | null
  significant: boolean
  winner: QrVariant | null
  /** Why there is no verdict yet. */
  note: string | null
}

function normalCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26 — plenty for a dashboard badge.
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp(-x * x / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}

/** Two-proportion z-test on lead rate per scan. Needs ≥ 30 scans and ≥ 5 leads on each arm to speak. */
export function twoProportionTest(a: ArmStats, b: ArmStats): AbTest {
  const rateA = a.scans ? a.leads / a.scans : 0
  const rateB = b.scans ? b.leads / b.scans : 0
  const lift = a.leads > 0 && a.scans > 0 && b.scans > 0 ? (rateB - rateA) / rateA : null
  const base: AbTest = { rateA, rateB, lift, z: null, p: null, significant: false, winner: null, note: null }
  if (a.scans < 30 || b.scans < 30) return { ...base, note: 'Needs at least 30 scans on each arm' }
  if (a.leads < 5 || b.leads < 5) return { ...base, note: 'Needs at least 5 leads on each arm' }
  const pooled = (a.leads + b.leads) / (a.scans + b.scans)
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.scans + 1 / b.scans))
  if (!se) return { ...base, note: 'No variation yet' }
  const z = (rateB - rateA) / se
  const p = 2 * (1 - normalCdf(Math.abs(z)))
  const significant = p < 0.05
  return { ...base, z, p, significant, winner: significant ? (z > 0 ? 'B' : 'A') : null, note: significant ? null : 'No significant difference yet' }
}
