<script setup lang="ts">
/**
 * Stacked progress bar showing how the agency is tracking toward the
 * Get Out target. Segments left-to-right:
 *   • Invoiced this month (solid green)
 *   • AR collectible (lighter green — AUTHORISED + due this month)
 *   • Recurring schedules firing this month (violet)
 *   • Probable quote close (amber, hatched — uncertainty)
 *   • Remaining gap to target (slate, hatched)
 *
 * Width of each segment is proportional to its $ value over the larger
 * of (target, totalProjected) so an over-target month doesn't clip.
 *
 * Negative leakage (credit notes + voided) is shown as a separate
 * red counter-line below the bar — money walking out the door.
 */

interface Layers {
  invoiced: number
  arCollectible: number
  recurring: number
  quotesProbable: number
}
interface Leakage {
  total: number
  creditNotes: number
  creditNotesCount: number
  voidedInvoices: number
}

const props = defineProps<{
  layers: Layers
  leakage: Leakage
  target: number
  totalProjected: number
  gap: number
  surplus: number
  onTrack: boolean
  currency?: string
}>()

const currency = computed(() => props.currency ?? 'AUD')

function fmt(value: number): string {
  if (value === 0) return '—'
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}k`
  return `$${Math.round(value).toLocaleString()}`
}

const denominator = computed(() => Math.max(props.target, props.totalProjected, 1))

function pct(value: number): string {
  return `${(value / denominator.value) * 100}%`
}

const segments = computed(() => {
  const segs = [
    { key: 'invoiced',     label: 'Invoiced',           amount: props.layers.invoiced,       color: 'bg-emerald-500'  },
    { key: 'ar',           label: 'AR collectible',     amount: props.layers.arCollectible,  color: 'bg-emerald-400'  },
    { key: 'recurring',    label: 'Recurring (this mo)', amount: props.layers.recurring,     color: 'bg-violet-500'   },
    { key: 'probable',     label: 'Probable (quotes)',  amount: props.layers.quotesProbable, color: 'bg-amber-400'    },
  ].filter(s => s.amount > 0)

  // Add the gap as the trailing segment when we're not on-track.
  if (!props.onTrack && props.gap > 0) {
    segs.push({
      key: 'gap',
      label: 'Gap to target',
      amount: props.gap,
      color: 'bg-slate-300/40 dark:bg-slate-600/40',
    })
  } else if (props.surplus > 0) {
    segs.push({
      key: 'surplus',
      label: 'Surplus',
      amount: props.surplus,
      color: 'bg-emerald-300',
    })
  }
  return segs
})

const targetMarkerLeft = computed(() => `${(props.target / denominator.value) * 100}%`)
</script>

<template>
  <div class="space-y-3">
    <!-- Headline numbers -->
    <div class="flex items-end justify-between flex-wrap gap-2">
      <div>
        <p class="text-xs uppercase text-muted">Projected this month</p>
        <p class="text-3xl font-bold tabular-nums" :class="onTrack ? 'text-emerald-600 dark:text-emerald-400' : ''">
          {{ fmt(totalProjected) }}
          <span class="text-base font-normal text-muted ml-2">of {{ fmt(target) }} target</span>
        </p>
      </div>
      <div class="text-right">
        <p class="text-xs uppercase text-muted">{{ onTrack ? 'Surplus' : 'Gap' }}</p>
        <p
          class="text-2xl font-bold tabular-nums"
          :class="onTrack ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'"
        >
          {{ onTrack ? '+' : '' }}{{ fmt(onTrack ? surplus : -gap) }}
        </p>
      </div>
    </div>

    <!-- Stacked segment bar -->
    <div class="relative h-8 rounded-lg overflow-hidden bg-muted/10">
      <div
        v-for="(seg, idx) in segments"
        :key="seg.key"
        :class="[
          'absolute top-0 bottom-0 transition-all',
          seg.color,
          idx > 0 && 'border-l border-white/30 dark:border-black/20',
        ]"
        :style="{
          left: `calc(${segments.slice(0, idx).reduce((s, p) => s + (p.amount / denominator) * 100, 0)}%)`,
          width: `calc(${(seg.amount / denominator) * 100}% - 0px)`,
        }"
        :title="`${seg.label}: ${fmt(seg.amount)}`"
      />
      <!-- Target marker (always at the same X regardless of segments) -->
      <div
        class="absolute top-0 bottom-0 w-px bg-default border-l-2 border-dashed border-slate-700 dark:border-slate-200"
        :style="{ left: targetMarkerLeft }"
      />
    </div>

    <!-- Legend -->
    <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <span v-for="seg in segments" :key="seg.key" class="flex items-center gap-1.5">
        <span :class="['size-3 rounded-sm', seg.color]" />
        <span class="text-muted">{{ seg.label }}</span>
        <span class="font-medium tabular-nums">{{ fmt(seg.amount) }}</span>
      </span>
    </div>

    <!-- Leakage counter-line -->
    <div
      v-if="leakage.total > 0"
      class="flex items-center gap-3 p-3 rounded-lg bg-red-50/70 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-sm"
    >
      <UIcon name="i-lucide-trending-down" class="size-4 text-red-500 shrink-0" />
      <div class="flex-1">
        <p class="font-medium text-red-700 dark:text-red-400">Leakage this month: {{ fmt(leakage.total) }}</p>
        <p class="text-xs text-muted">
          <span v-if="leakage.creditNotes > 0">{{ leakage.creditNotesCount }} credit note{{ leakage.creditNotesCount === 1 ? '' : 's' }} ({{ fmt(leakage.creditNotes) }})</span>
          <span v-if="leakage.creditNotes > 0 && leakage.voidedInvoices > 0"> · </span>
          <span v-if="leakage.voidedInvoices > 0">voided invoices {{ fmt(leakage.voidedInvoices) }}</span>
        </p>
      </div>
    </div>
  </div>
</template>
