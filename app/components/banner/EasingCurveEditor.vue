<script setup lang="ts">
/**
 * Visual cubic-bezier easing curve editor.
 * Shows a canvas with the curve, two draggable control points,
 * preset buttons, and a preview animation ball.
 */

const props = defineProps<{
  modelValue: string // GSAP ease name or cubic-bezier(x1,y1,x2,y2)
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// Canvas sizing
const CANVAS_W = 180
const CANVAS_H = 180
const PAD = 16

const canvasRef = ref<HTMLCanvasElement | null>(null)
const previewBallRef = ref<HTMLDivElement | null>(null)

// Preset easing curves mapped to cubic-bezier control points
const PRESET_CURVES: { label: string; value: string; cp: [number, number, number, number] }[] = [
  { label: 'Linear', value: 'none', cp: [0, 0, 1, 1] },
  { label: 'Ease', value: 'power1.out', cp: [0.25, 0.1, 0.25, 1] },
  { label: 'Ease In', value: 'power2.in', cp: [0.42, 0, 1, 1] },
  { label: 'Ease Out', value: 'power2.out', cp: [0, 0, 0.58, 1] },
  { label: 'Ease InOut', value: 'power2.inOut', cp: [0.42, 0, 0.58, 1] },
  { label: 'Back Out', value: 'back.out(1.7)', cp: [0.175, 0.885, 0.32, 1.275] },
  { label: 'Circ Out', value: 'circ.out', cp: [0.075, 0.82, 0.165, 1] },
  { label: 'Expo Out', value: 'expo.out', cp: [0.19, 1, 0.22, 1] },
]

// GSAP ease name → control points (for known presets)
const GSAP_TO_CP: Record<string, [number, number, number, number]> = {
  'none': [0, 0, 1, 1],
  'power1.out': [0.25, 0.1, 0.25, 1],
  'power1.in': [0.42, 0, 1, 1],
  'power1.inOut': [0.42, 0, 0.58, 1],
  'power2.out': [0, 0, 0.58, 1],
  'power2.in': [0.55, 0.085, 0.68, 0.53],
  'power2.inOut': [0.455, 0.03, 0.515, 0.955],
  'power3.out': [0.215, 0.61, 0.355, 1],
  'power3.in': [0.645, 0.045, 0.355, 1],
  'sine.out': [0.39, 0.575, 0.565, 1],
  'sine.in': [0.47, 0, 0.745, 0.715],
  'sine.inOut': [0.445, 0.05, 0.55, 0.95],
  'back.out(1.7)': [0.175, 0.885, 0.32, 1.275],
  'circ.out': [0.075, 0.82, 0.165, 1],
  'expo.out': [0.19, 1, 0.22, 1],
  'bounce.out': [0.34, 1.56, 0.64, 1],
  'elastic.out(1,0.5)': [0.68, -0.55, 0.265, 1.55],
}

// Current control points
const cp1 = reactive({ x: 0.25, y: 0.1 })
const cp2 = reactive({ x: 0.25, y: 1 })

// Dragging state
const dragging = ref<'cp1' | 'cp2' | null>(null)

// Parse incoming value to control points
function parseValue(val: string) {
  // Check GSAP preset mapping
  if (GSAP_TO_CP[val]) {
    const [x1, y1, x2, y2] = GSAP_TO_CP[val]
    cp1.x = x1; cp1.y = y1
    cp2.x = x2; cp2.y = y2
    return
  }
  // Try cubic-bezier(x1,y1,x2,y2) format
  const match = val.match(/cubic-bezier\(\s*([\d.]+)\s*,\s*([\d.-]+)\s*,\s*([\d.]+)\s*,\s*([\d.-]+)\s*\)/)
  if (match) {
    cp1.x = parseFloat(match[1])
    cp1.y = parseFloat(match[2])
    cp2.x = parseFloat(match[3])
    cp2.y = parseFloat(match[4])
    return
  }
  // Default
  cp1.x = 0.25; cp1.y = 0.1
  cp2.x = 0.25; cp2.y = 1
}

// Convert control points to CSS or GSAP string
function emitValue() {
  // Check if matches a known GSAP preset
  for (const [key, pts] of Object.entries(GSAP_TO_CP)) {
    if (Math.abs(cp1.x - pts[0]) < 0.02 && Math.abs(cp1.y - pts[1]) < 0.02
      && Math.abs(cp2.x - pts[2]) < 0.02 && Math.abs(cp2.y - pts[3]) < 0.02) {
      emit('update:modelValue', key)
      return
    }
  }
  // Custom cubic-bezier
  emit('update:modelValue', `cubic-bezier(${cp1.x.toFixed(3)},${cp1.y.toFixed(3)},${cp2.x.toFixed(3)},${cp2.y.toFixed(3)})`)
}

// Canvas coordinate helpers
function toCanvasX(t: number): number {
  return PAD + t * (CANVAS_W - 2 * PAD)
}
function toCanvasY(v: number): number {
  return CANVAS_H - PAD - v * (CANVAS_H - 2 * PAD)
}
function fromCanvasX(cx: number): number {
  return Math.max(0, Math.min(1, (cx - PAD) / (CANVAS_W - 2 * PAD)))
}
function fromCanvasY(cy: number): number {
  return Math.max(-0.5, Math.min(1.5, (CANVAS_H - PAD - cy) / (CANVAS_H - 2 * PAD)))
}

// Draw the curve on canvas
function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

  // Grid
  ctx.strokeStyle = 'rgba(128,128,128,0.15)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const t = i / 4
    ctx.beginPath()
    ctx.moveTo(toCanvasX(t), PAD)
    ctx.lineTo(toCanvasX(t), CANVAS_H - PAD)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(PAD, toCanvasY(t))
    ctx.lineTo(CANVAS_W - PAD, toCanvasY(t))
    ctx.stroke()
  }

  // Diagonal reference (linear)
  ctx.strokeStyle = 'rgba(128,128,128,0.25)'
  ctx.setLineDash([3, 3])
  ctx.beginPath()
  ctx.moveTo(toCanvasX(0), toCanvasY(0))
  ctx.lineTo(toCanvasX(1), toCanvasY(1))
  ctx.stroke()
  ctx.setLineDash([])

  // Control point handles (lines from endpoints to control points)
  ctx.strokeStyle = 'rgba(100,149,237,0.5)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(toCanvasX(0), toCanvasY(0))
  ctx.lineTo(toCanvasX(cp1.x), toCanvasY(cp1.y))
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(toCanvasX(1), toCanvasY(1))
  ctx.lineTo(toCanvasX(cp2.x), toCanvasY(cp2.y))
  ctx.stroke()

  // Bezier curve
  ctx.strokeStyle = '#e8c84a'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(toCanvasX(0), toCanvasY(0))
  ctx.bezierCurveTo(
    toCanvasX(cp1.x), toCanvasY(cp1.y),
    toCanvasX(cp2.x), toCanvasY(cp2.y),
    toCanvasX(1), toCanvasY(1),
  )
  ctx.stroke()

  // Control point circles
  const points = [
    { p: cp1, active: dragging.value === 'cp1' },
    { p: cp2, active: dragging.value === 'cp2' },
  ]
  for (const { p, active } of points) {
    ctx.fillStyle = active ? '#e8c84a' : '#6495ed'
    ctx.beginPath()
    ctx.arc(toCanvasX(p.x), toCanvasY(p.y), active ? 6 : 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}

// Mouse events for control point dragging
function onCanvasMouseDown(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const cx = (e.clientX - rect.left) * (CANVAS_W / rect.width)
  const cy = (e.clientY - rect.top) * (CANVAS_H / rect.height)

  // Check which control point is closest
  const d1 = Math.hypot(cx - toCanvasX(cp1.x), cy - toCanvasY(cp1.y))
  const d2 = Math.hypot(cx - toCanvasX(cp2.x), cy - toCanvasY(cp2.y))

  if (d1 < 20 && d1 < d2) {
    dragging.value = 'cp1'
  } else if (d2 < 20) {
    dragging.value = 'cp2'
  }

  if (dragging.value) {
    window.addEventListener('mousemove', onCanvasMouseMove)
    window.addEventListener('mouseup', onCanvasMouseUp)
  }
}

function onCanvasMouseMove(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas || !dragging.value) return
  const rect = canvas.getBoundingClientRect()
  const cx = (e.clientX - rect.left) * (CANVAS_W / rect.width)
  const cy = (e.clientY - rect.top) * (CANVAS_H / rect.height)

  const target = dragging.value === 'cp1' ? cp1 : cp2
  target.x = fromCanvasX(cx)
  target.y = fromCanvasY(cy)

  draw()
}

function onCanvasMouseUp() {
  if (dragging.value) {
    emitValue()
  }
  dragging.value = null
  window.removeEventListener('mousemove', onCanvasMouseMove)
  window.removeEventListener('mouseup', onCanvasMouseUp)
}

function applyPreset(preset: typeof PRESET_CURVES[0]) {
  cp1.x = preset.cp[0]; cp1.y = preset.cp[1]
  cp2.x = preset.cp[2]; cp2.y = preset.cp[3]
  emit('update:modelValue', preset.value)
  draw()
  runPreview()
}

// Preview ball animation
let previewTimeout: ReturnType<typeof setTimeout> | null = null

function runPreview() {
  const ball = previewBallRef.value
  if (!ball) return
  if (previewTimeout) clearTimeout(previewTimeout)

  ball.style.transition = 'none'
  ball.style.left = '0px'

  requestAnimationFrame(() => {
    ball.style.transition = `left 1s cubic-bezier(${cp1.x},${cp1.y},${cp2.x},${cp2.y})`
    ball.style.left = '100%'
    previewTimeout = setTimeout(() => {
      ball.style.transition = 'none'
      ball.style.left = '0px'
    }, 1200)
  })
}

// Initialize
watch(() => props.modelValue, (val) => {
  if (!dragging.value) {
    parseValue(val)
    nextTick(draw)
  }
}, { immediate: true })

onMounted(() => {
  nextTick(draw)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onCanvasMouseMove)
  window.removeEventListener('mouseup', onCanvasMouseUp)
  if (previewTimeout) clearTimeout(previewTimeout)
})
</script>

<template>
  <div class="space-y-3">
    <!-- Canvas -->
    <div class="flex justify-center">
      <canvas
        ref="canvasRef"
        :width="CANVAS_W"
        :height="CANVAS_H"
        class="rounded-lg bg-(--ui-bg) border border-(--ui-border) cursor-crosshair"
        :style="{ width: `${CANVAS_W}px`, height: `${CANVAS_H}px` }"
        @mousedown="onCanvasMouseDown"
      />
    </div>

    <!-- Preview ball -->
    <div class="relative h-5 bg-(--ui-bg) rounded-full overflow-hidden border border-(--ui-border)/50">
      <div
        ref="previewBallRef"
        class="absolute top-0.5 w-4 h-4 rounded-full bg-(--ui-primary)"
        style="left: 0px;"
      />
    </div>
    <button class="text-[10px] text-(--ui-text-muted) hover:text-(--ui-text) w-full text-center" @click="runPreview">
      Preview
    </button>

    <!-- Current value display -->
    <div class="text-[9px] font-mono text-(--ui-text-dimmed) text-center px-2 truncate">
      {{ modelValue }}
    </div>

    <!-- Presets grid -->
    <div class="grid grid-cols-2 gap-1">
      <button
        v-for="preset in PRESET_CURVES"
        :key="preset.value"
        class="text-[10px] px-2 py-1 rounded border border-(--ui-border)/50 hover:bg-(--ui-bg-accented) transition-colors truncate"
        :class="modelValue === preset.value ? 'bg-(--ui-bg-accented) text-(--ui-primary) border-(--ui-primary)/30' : 'text-(--ui-text-muted)'"
        @click="applyPreset(preset)"
      >
        {{ preset.label }}
      </button>
    </div>
  </div>
</template>
