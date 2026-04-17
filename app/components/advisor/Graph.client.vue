<script setup lang="ts">
/**
 * Advisor recommendation graph — small radial node-link SVG.
 * Deliberately hand-rolled instead of Unovis VisGraph to keep the drawer
 * lightweight and avoid force-sim jitter for ≤20 nodes.
 */

type NodeType =
  | 'recommendation' | 'client' | 'report' | 'metric'
  | 'outcome' | 'event' | 'assignee' | 'similar'

type GraphNode = {
  id: string
  type: NodeType
  label: string
  sublabel?: string
  meta?: Record<string, any>
}

type GraphEdge = { from: string; to: string; type: string; label?: string }

type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] }

const props = defineProps<{ data: GraphData | null }>()
const emit = defineEmits<{ (e: 'select', node: GraphNode): void }>()

const WIDTH = 560
const HEIGHT = 340
const CENTER_X = WIDTH / 2
const CENTER_Y = HEIGHT / 2
const RADIUS = 130

const typeColor: Record<NodeType, string> = {
  recommendation: '#8b5cf6', // violet
  client: '#0ea5e9',         // sky
  report: '#6366f1',         // indigo
  metric: '#f59e0b',         // amber
  outcome: '#10b981',        // emerald
  event: '#64748b',          // slate
  assignee: '#ec4899',       // pink
  similar: '#a855f7',        // purple
}

const typeIcon: Record<NodeType, string> = {
  recommendation: '◆',
  client: '○',
  report: '▣',
  metric: '△',
  outcome: '✓',
  event: '·',
  assignee: '◎',
  similar: '≈',
}

const laidOut = computed(() => {
  if (!props.data) return { nodes: [], edges: [], byId: new Map() }

  const root = props.data.nodes.find((n) => n.type === 'recommendation')
  const others = props.data.nodes.filter((n) => n !== root)

  const positions = new Map<string, { x: number; y: number }>()
  if (root) positions.set(root.id, { x: CENTER_X, y: CENTER_Y })

  // Distribute leaves around the circle, bucketing by type so related
  // nodes cluster together.
  const typeOrder: NodeType[] = ['client', 'report', 'metric', 'assignee', 'outcome', 'event', 'similar']
  const ordered: GraphNode[] = []
  for (const t of typeOrder) ordered.push(...others.filter((n) => n.type === t))

  const step = (Math.PI * 2) / Math.max(ordered.length, 1)
  ordered.forEach((n, i) => {
    // Start at -PI/2 so the first node lands at the top.
    const angle = -Math.PI / 2 + i * step
    positions.set(n.id, {
      x: CENTER_X + Math.cos(angle) * RADIUS,
      y: CENTER_Y + Math.sin(angle) * RADIUS,
    })
  })

  const byId = new Map(props.data.nodes.map((n) => [n.id, n]))
  return { nodes: props.data.nodes, edges: props.data.edges, byId, positions }
})

function nodeColor(n: GraphNode) { return typeColor[n.type] }
function nodeIcon(n: GraphNode) { return typeIcon[n.type] }

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
</script>

<template>
  <div class="rounded-lg border border-default bg-elevated/30 overflow-hidden">
    <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" class="w-full h-auto block" xmlns="http://www.w3.org/2000/svg">
      <!-- Edges -->
      <g v-if="data" stroke-linecap="round">
        <line
          v-for="(e, i) in laidOut.edges"
          :key="`edge-${i}`"
          :x1="laidOut.positions?.get(e.from)?.x"
          :y1="laidOut.positions?.get(e.from)?.y"
          :x2="laidOut.positions?.get(e.to)?.x"
          :y2="laidOut.positions?.get(e.to)?.y"
          stroke="currentColor"
          stroke-opacity="0.15"
          stroke-width="1"
        />
      </g>

      <!-- Nodes -->
      <g v-if="data">
        <g
          v-for="n in laidOut.nodes"
          :key="n.id"
          :transform="`translate(${laidOut.positions?.get(n.id)?.x ?? 0}, ${laidOut.positions?.get(n.id)?.y ?? 0})`"
          class="cursor-pointer"
          @click="emit('select', n)"
        >
          <circle
            :r="n.type === 'recommendation' ? 18 : 10"
            :fill="nodeColor(n)"
            fill-opacity="0.15"
            :stroke="nodeColor(n)"
            stroke-width="1.5"
          />
          <text
            text-anchor="middle"
            dominant-baseline="central"
            :fill="nodeColor(n)"
            :font-size="n.type === 'recommendation' ? 14 : 10"
            font-weight="600"
          >{{ nodeIcon(n) }}</text>
          <text
            :y="n.type === 'recommendation' ? 32 : 22"
            text-anchor="middle"
            fill="currentColor"
            font-size="10"
            class="text-default select-none pointer-events-none"
          >{{ truncate(n.label, n.type === 'recommendation' ? 30 : 18) }}</text>
          <text
            v-if="n.sublabel"
            :y="n.type === 'recommendation' ? 44 : 34"
            text-anchor="middle"
            fill="currentColor"
            fill-opacity="0.55"
            font-size="9"
            class="select-none pointer-events-none"
          >{{ truncate(n.sublabel, n.type === 'recommendation' ? 28 : 16) }}</text>
        </g>
      </g>

      <text
        v-if="!data || !data.nodes.length"
        :x="CENTER_X"
        :y="CENTER_Y"
        text-anchor="middle"
        fill="currentColor"
        fill-opacity="0.4"
        font-size="12"
      >No relationships yet</text>
    </svg>

    <!-- Legend -->
    <div class="border-t border-default px-3 py-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted">
      <span v-for="t in ['client','report','metric','assignee','outcome','event','similar'] as NodeType[]" :key="t" class="flex items-center gap-1">
        <span class="inline-block size-2 rounded-full" :style="{ backgroundColor: typeColor[t] }" />
        {{ t }}
      </span>
    </div>
  </div>
</template>
