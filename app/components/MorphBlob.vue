<template>
  <div class="relative">
    <svg class="absolute w-0 h-0 overflow-hidden" aria-hidden="true">
      <defs>
        <clipPath :id="clipId" clipPathUnits="objectBoundingBox">
          <path :d="pathD" />
        </clipPath>
      </defs>
    </svg>
    <div class="w-full h-full" :style="{ clipPath: `url(#${clipId})` }">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  points?: number
  radius?: number
  seed?: number
  amplitude?: number
  animate?: boolean
}>(), {
  points: 12,
  radius: 0.42,
  seed: 0,
  amplitude: 0.003,
  animate: true
})

const clipId = `morph-${useId()}`

// Mulberry32 PRNG — deterministic so SSR path matches client hydration
function mulberry32(a: number) {
  return () => {
    let t = a += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

const rand = mulberry32(props.seed * 7 + 1337)
const n = props.points
const div = (Math.PI * 2) / n

// ── Shape variety ──
// 8 base shapes: each returns a per-point radius multiplier
const shapeType = Math.abs(props.seed) % 8

function baseRadius(i: number): number {
  const angle = div * (i + 1)
  const r = props.radius
  switch (shapeType) {
    case 0: // Organic blob — random variation
      return r * (0.90 + rand() * 0.20)
    case 1: // Egg — narrower top, wider bottom
      return r * (1 - 0.10 * Math.cos(angle))
    case 2: // Wide oval — wider at sides
      return r * (1 + 0.09 * Math.sin(angle * 2))
    case 3: // Diamond — 4 peaks
      return r * (1 + 0.12 * Math.abs(Math.cos(angle * 2)))
    case 4: // Squircle — subtle 8-point star
      return r * (0.95 + 0.09 * Math.pow(Math.cos(angle * 4), 2))
    case 5: // Peanut — pinched at sides
      return r * (1 - 0.08 * Math.cos(angle * 2))
    case 6: // Teardrop — asymmetric
      return r * (1 - 0.06 * Math.cos(angle) + 0.05 * Math.sin(angle))
    case 7: // Wobbly — seeded random per-point
      return r * (0.88 + rand() * 0.24)
    default:
      return r
  }
}

// Pre-computed trig, base radii, and state arrays
const cx: number[] = []
const cy: number[] = []
const baseR: number[] = []
const radial: number[] = []
const spd: number[] = []

for (let i = 0; i < n; i++) {
  const az = div * (i + 1)
  cx.push(Math.cos(az))
  cy.push(Math.sin(az))
  baseR.push(baseRadius(i))
  radial.push(0)
  spd.push(0)
}

// Seed each point with a random initial kick
for (let i = 0; i < n; i++) {
  const acc = -0.3 + rand() * 0.6
  spd[i] += acc * 2
  radial[i] += spd[i] * 5
}

const ELASTICITY = 0.001
const FRICTION = 0.0085

function fmt(v: number) {
  return v.toFixed(4)
}

function solve() {
  for (let i = 0; i < n; i++) {
    const l = (i - 1 + n) % n
    const r = (i + 1) % n
    const acc
      = (-0.3 * radial[i]
        + (radial[l] - radial[i])
        + (radial[r] - radial[i]))
      * ELASTICITY
      - spd[i] * FRICTION
    spd[i] += acc * 2
    radial[i] += spd[i] * 5
  }
}

function buildPath() {
  const scale = props.amplitude
  const px: number[] = []
  const py: number[] = []

  for (let i = 0; i < n; i++) {
    const rr = baseR[i] + radial[i] * scale
    px.push(0.5 + cx[i] * rr)
    py.push(0.5 + cy[i] * rr)
  }

  let d = `M${fmt((px[n - 1] + px[0]) / 2)},${fmt((py[n - 1] + py[0]) / 2)}`
  for (let i = 0; i < n; i++) {
    const nx = (i + 1) % n
    d += ` Q${fmt(px[i])},${fmt(py[i])} ${fmt((px[i] + px[nx]) / 2)},${fmt((py[i] + py[nx]) / 2)}`
  }
  return d + 'Z'
}

const pathD = ref(buildPath())
let raf: number | null = null
let running = false

function tick() {
  solve()
  pathD.value = buildPath()
  if (running) raf = requestAnimationFrame(tick)
}

onMounted(() => {
  if (!props.animate) return
  running = true
  raf = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  running = false
  if (raf !== null) cancelAnimationFrame(raf)
})
</script>
