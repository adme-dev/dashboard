<script setup lang="ts">
/**
 * Inline-SVG sparkline of monthly revenue. Lightweight (no chart-lib import),
 * theme-aware (uses currentColor), and tolerant of empty / sparse data.
 *
 * Usage:
 *   <CustomersRevenueSparkline :buckets="customer.last12mBuckets" />
 *
 * `buckets` is the array straight from /api/customers — each entry is
 * `{ month: 'YYYY-MM', cents: number }`. Order is oldest → newest.
 */

interface Bucket {
  month: string
  cents: number
}

const props = withDefaults(
  defineProps<{
    buckets: Bucket[]
    width?: number
    height?: number
    /** When false, render only the line. */
    showArea?: boolean
  }>(),
  {
    width: 80,
    height: 24,
    showArea: true,
  },
)

// Pad to 12 buckets so sparse customers still render a comparable shape.
// Missing months go to zero on the left (oldest) side.
const padded = computed<Bucket[]>(() => {
  const n = 12
  if (props.buckets.length >= n) return props.buckets.slice(-n)
  const pad: Bucket[] = []
  for (let i = props.buckets.length; i < n; i++) {
    pad.push({ month: '', cents: 0 })
  }
  return [...pad, ...props.buckets]
})

const path = computed(() => {
  const points = padded.value
  if (points.length < 2) return { line: '', area: '' }

  const w = props.width
  const h = props.height
  const pad = 1  // leave a hair of breathing room top/bottom

  const max = Math.max(1, ...points.map(p => p.cents))
  const stepX = w / (points.length - 1)

  const coords = points.map((p, i) => {
    const x = i * stepX
    // Higher cents → smaller y (SVG origin top-left). Clamp to the
    // padded inner range so 100% utilisation doesn't clip the stroke.
    const y = h - pad - ((p.cents / max) * (h - pad * 2))
    return { x, y }
  })

  const line = coords.map((c, i) => (i === 0 ? `M${c.x},${c.y}` : `L${c.x},${c.y}`)).join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`

  return { line, area }
})

const trend = computed<'up' | 'down' | 'flat'>(() => {
  const pts = padded.value
  if (pts.length < 2) return 'flat'
  // Compare the most recent 3 months to the prior 3 months — less noisy
  // than first-vs-last for short series.
  const recent = pts.slice(-3).reduce((s, p) => s + p.cents, 0)
  const prior  = pts.slice(-6, -3).reduce((s, p) => s + p.cents, 0)
  if (recent > prior * 1.05) return 'up'
  if (recent < prior * 0.95) return 'down'
  return 'flat'
})

const trendClass = computed(() => {
  if (trend.value === 'up') return 'text-emerald-500 dark:text-emerald-400'
  if (trend.value === 'down') return 'text-red-500 dark:text-red-400'
  return 'text-muted'
})

const ariaLabel = computed(() => {
  const total = padded.value.reduce((s, p) => s + p.cents, 0)
  const trendWord = trend.value === 'up' ? 'trending up' : trend.value === 'down' ? 'trending down' : 'flat'
  return `12-month revenue sparkline, ${trendWord}, $${(total / 100).toLocaleString()} total.`
})
</script>

<template>
  <svg
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    role="img"
    :aria-label="ariaLabel"
    :class="trendClass"
    class="overflow-visible"
  >
    <path
      v-if="showArea && path.area"
      :d="path.area"
      fill="currentColor"
      fill-opacity="0.15"
    />
    <path
      v-if="path.line"
      :d="path.line"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
