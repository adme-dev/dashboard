<script setup lang="ts">
// Drawer extracted from app/pages/advisor/index.vue. State (open/loading/rec/
// events/outcomes/similar/graph) lives in the parent; this component is
// presentational + emits patch / open-similar / graph-select / update:open.
//
// Drawer-local helpers (METRIC_META, formatMetric, formatDelta,
// deltaDirection, prettyEvent) and option lists (statusOptions /
// priorityOptions / assigneeDrawerOptions / CATEGORY_OPTIONS) are kept
// here because they are only used in the drawer's render.

import { CATEGORIES, CATEGORY_LABELS } from '~~/server/utils/advisorCategories'

type Recommendation = {
  id: string
  tenant_id: string
  client_id: string | null
  client_name: string | null
  source_report_id: string | null
  period_key: string | null
  period_label: string | null
  title: string
  action: string
  impact: string | null
  priority: 'low' | 'medium' | 'high'
  target_metric: string | null
  baseline_metric_value: number | null
  target_direction: 'up' | 'down' | null
  status: 'open' | 'in_progress' | 'done' | 'dismissed'
  due_date: string | null
  assigned_to: string | null
  assignee_name: string | null
  assignee_avatar_url: string | null
  acted_at: string | null
  outcome_notes: string | null
  category: string | null
  effort: 'xs' | 's' | 'm' | 'l' | 'xl' | null
  snoozed_until: string | null
  source: 'ai' | 'manual'
  created_by: string | null
  created_by_name: string | null
  created_by_avatar_url: string | null
  created_at: string
  updated_at: string
}

type RecommendationEvent = {
  id: string
  event_type: string
  actor_id: string | null
  actor_name: string | null
  actor_avatar_url: string | null
  payload: any
  created_at: string
}

type RecommendationOutcome = {
  id: string
  measured_at: string
  days_after_action: number | null
  metric_value: number | null
  metric_delta: number | null
  notes: string | null
}

type SimilarMatch = Recommendation & { score: number }

type GraphNode = {
  id: string
  type: 'recommendation' | 'client' | 'report' | 'metric' | 'outcome' | 'event' | 'assignee' | 'similar'
  label: string
  sublabel?: string
  meta?: Record<string, any>
}
type GraphData = { nodes: GraphNode[]; edges: Array<{ from: string; to: string; type: string; label?: string }> }

type Comment = {
  id: string
  recommendation_id: string
  author_id: string | null
  author_name: string | null
  author_avatar_url: string | null
  body: string
  created_at: string
  updated_at: string
}

const props = defineProps<{
  open: boolean
  loading: boolean
  rec: Recommendation | null
  events: RecommendationEvent[]
  outcomes: RecommendationOutcome[]
  similar: SimilarMatch[]
  graph: GraphData | null
  teamMembers: Array<{ id: string; name: string; avatar_url?: string | null }>
  comments: Comment[]
  currentUserId: string | null
  canPrivilegedEdit: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'patch', patch: Partial<Recommendation>): void
  (e: 'open-similar', rec: Recommendation): void
  (e: 'graph-select', node: GraphNode): void
  (e: 'comments-changed'): void
}>()

// ── Formatters ──────────────────────────────────────────────────────
function priorityColor(p: string) {
  if (p === 'high') return 'error'
  if (p === 'medium') return 'warning'
  return 'neutral'
}

function statusColor(s: string) {
  if (s === 'done') return 'success'
  if (s === 'in_progress') return 'primary'
  if (s === 'dismissed') return 'neutral'
  return 'warning'
}

function statusLabel(s: string) {
  if (s === 'in_progress') return 'In progress'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// Mirrors the unit/label set in server/utils/advisorMetrics.ts so we can
// format metric values consistently in the UI without a round-trip.
const METRIC_META: Record<string, { label: string; unit: 'percent' | 'days' | 'currency' | 'ratio' | 'count' }> = {
  netMarginMonth: { label: 'Net margin (month)', unit: 'percent' },
  netProfitMonth: { label: 'Net profit (month)', unit: 'currency' },
  netProfitYtd: { label: 'Net profit (YTD)', unit: 'currency' },
  revenueMonth: { label: 'Revenue (month)', unit: 'currency' },
  debtorDays: { label: 'Debtor days', unit: 'days' },
  creditorDays: { label: 'Creditor days', unit: 'days' },
  grossProfitPercent: { label: 'Gross profit %', unit: 'percent' },
  netProfitPercent: { label: 'Net profit %', unit: 'percent' },
  currentRatio: { label: 'Current ratio', unit: 'ratio' },
  top1Share: { label: 'Top-1 client share', unit: 'percent' },
  top3Share: { label: 'Top-3 client share', unit: 'percent' },
  mrr: { label: 'MRR', unit: 'currency' },
  outstandingTotal: { label: 'Outstanding A/R', unit: 'currency' },
  overdueAmount: { label: 'Overdue A/R', unit: 'currency' },
  totalUnearned: { label: 'Unearned revenue', unit: 'currency' },
}

function formatMetric(value: number | null | undefined, metric: string | null | undefined): string {
  if (value == null) return '—'
  const n = Number(value)
  const unit = (metric && METRIC_META[metric]?.unit) || 'count'
  if (unit === 'currency') return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
  if (unit === 'percent') return `${n.toFixed(1)}%`
  if (unit === 'days') return `${Math.round(n)} days`
  if (unit === 'ratio') return n.toFixed(2)
  return n.toLocaleString()
}

function formatDelta(delta: number | null | undefined, metric: string | null | undefined): string {
  if (delta == null) return '—'
  const n = Number(delta)
  const sign = n > 0 ? '+' : ''
  const unit = (metric && METRIC_META[metric]?.unit) || 'count'
  if (unit === 'currency') return `${sign}${n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })}`
  if (unit === 'percent') return `${sign}${n.toFixed(1)} pts`
  if (unit === 'days') return `${sign}${Math.round(n)} d`
  if (unit === 'ratio') return `${sign}${n.toFixed(2)}`
  return `${sign}${n.toLocaleString()}`
}

function deltaDirection(delta: number | null | undefined, direction: 'up' | 'down' | null | undefined): 'good' | 'bad' | 'neutral' {
  if (delta == null || delta === 0) return 'neutral'
  if (!direction) return delta > 0 ? 'good' : 'bad'
  if (direction === 'up') return delta > 0 ? 'good' : 'bad'
  return delta < 0 ? 'good' : 'bad'
}

function prettyEvent(e: RecommendationEvent) {
  if (e.event_type === 'updated' && e.payload) {
    const keys = Object.keys(e.payload)
    if (keys.length === 1) {
      const k = keys[0]!
      const change = e.payload[k]
      return `${k.replace(/_/g, ' ')}: ${change.from ?? '—'} → ${change.to ?? '—'}`
    }
    return `Updated ${keys.length} fields`
  }
  return e.event_type
}

// ── Event grouping ──────────────────────────────────────────────────
// Bulk patches emit one event per row, which can flood the activity
// log when the user updates 50 items. Collapse consecutive
// 'bulk_updated' events from the same actor within a 5-minute window
// into a single rendered row showing the count.
type DisplayEvent = RecommendationEvent & { count?: number }

const FIVE_MIN_MS = 5 * 60 * 1000

const displayedEvents = computed<DisplayEvent[]>(() => {
  const out: DisplayEvent[] = []
  for (const e of props.events) {
    const last = out[out.length - 1]
    const sameKind =
      last &&
      last.event_type === 'bulk_updated' &&
      e.event_type === 'bulk_updated' &&
      last.actor_id === e.actor_id &&
      Math.abs(new Date(last.created_at).getTime() - new Date(e.created_at).getTime()) < FIVE_MIN_MS
    if (sameKind) {
      last!.count = (last!.count ?? 1) + 1
    } else {
      out.push({ ...e, count: e.event_type === 'bulk_updated' ? 1 : undefined })
    }
  }
  return out
})

function eventLabel(e: DisplayEvent): string {
  if (e.event_type === 'bulk_updated' && e.count && e.count > 1) {
    return `bulk-updated ${e.count} items`
  }
  return prettyEvent(e)
}

// ── Option lists ────────────────────────────────────────────────────
const statusOptions = [
  { label: 'Open', value: 'open' },
  { label: 'In progress', value: 'in_progress' },
  { label: 'Done', value: 'done' },
  { label: 'Dismissed', value: 'dismissed' },
]

const priorityOptions = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
]

const UNASSIGNED = '__unassigned__'
const UNCATEGORIZED = '__none__'

const assigneeDrawerOptions = computed(() => ([
  { label: 'Unassigned', value: UNASSIGNED },
  ...props.teamMembers.map((m) => ({ label: m.name, value: m.id })),
]))

const CATEGORY_OPTIONS = [
  { label: 'Uncategorized', value: UNCATEGORIZED },
  ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
]

// ── Outcome notes draft (local; resets on rec change) ───────────────
const outcomeNotesDraft = ref('')
watch(() => props.rec, (v) => { outcomeNotesDraft.value = v?.outcome_notes ?? '' }, { immediate: true })

function setOpen(v: boolean) {
  emit('update:open', v)
}
</script>

<template>
  <USlideover :open="open" :ui="{ content: 'max-w-2xl' }" @update:open="setOpen">
    <template #content>
      <div v-if="rec" class="flex flex-col h-full">
        <div class="flex items-start justify-between p-5 border-b border-default">
          <div class="flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <UBadge :color="priorityColor(rec.priority)" variant="subtle" size="xs">{{ rec.priority }}</UBadge>
              <UBadge :color="statusColor(rec.status)" variant="subtle" size="xs">{{ statusLabel(rec.status) }}</UBadge>
              <AdvisorCategoryBadge :category="rec.category" size="xs" />
              <UBadge :color="rec.source === 'manual' ? 'info' : 'neutral'" variant="subtle" size="xs">
                {{ rec.source === 'manual' ? 'Manual' : 'AI' }}
              </UBadge>
              <span class="text-xs text-muted">{{ rec.period_label ?? 'Unlinked' }}</span>
            </div>
            <h3 class="font-semibold text-lg mt-1">{{ rec.title }}</h3>
          </div>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="setOpen(false)" />
        </div>

        <div class="flex-1 overflow-y-auto p-5 space-y-5">
          <!-- Action & impact -->
          <div class="space-y-2">
            <p class="text-[10px] uppercase text-muted font-semibold tracking-wider">Recommended action</p>
            <p class="text-sm leading-relaxed">{{ rec.action }}</p>
            <p v-if="rec.impact" class="text-sm text-primary">Impact: {{ rec.impact }}</p>
          </div>

          <!-- Controls grid -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <p class="text-xs text-muted mb-1">Status</p>
              <USelectMenu
                :model-value="rec.status"
                :items="statusOptions"
                value-key="value"
                size="sm"
                @update:model-value="(v: string) => emit('patch', { status: v as any })"
              />
            </div>
            <div>
              <p class="text-xs text-muted mb-1">Priority</p>
              <USelectMenu
                :model-value="rec.priority"
                :items="priorityOptions"
                value-key="value"
                size="sm"
                @update:model-value="(v: string) => emit('patch', { priority: v as any })"
              />
            </div>
            <div>
              <p class="text-xs text-muted mb-1">Assignee</p>
              <USelectMenu
                :model-value="rec.assigned_to ?? UNASSIGNED"
                :items="assigneeDrawerOptions"
                value-key="value"
                size="sm"
                @update:model-value="(v: string) => emit('patch', { assigned_to: (v === UNASSIGNED ? null : v) as any })"
              />
            </div>
            <div>
              <p class="text-xs text-muted mb-1">Due date</p>
              <UInput
                :model-value="rec.due_date ?? ''"
                type="date"
                size="sm"
                @change="(e: Event) => emit('patch', { due_date: ((e.target as HTMLInputElement).value || null) as any })"
              />
            </div>
            <div>
              <p class="text-xs text-muted mb-1">Category</p>
              <USelectMenu
                :model-value="rec.category ?? UNCATEGORIZED"
                :items="CATEGORY_OPTIONS"
                value-key="value"
                size="sm"
                @update:model-value="(v: string) => emit('patch', { category: (v === UNCATEGORIZED ? null : v) as any })"
              />
            </div>
            <div>
              <p class="text-xs text-muted mb-1 flex items-center gap-1">
                Snoozed until
                <UButton
                  v-if="rec.snoozed_until"
                  icon="i-lucide-x"
                  size="3xs"
                  color="neutral"
                  variant="ghost"
                  @click="emit('patch', { snoozed_until: null as any })"
                />
              </p>
              <UInput
                :model-value="rec.snoozed_until ?? ''"
                type="date"
                size="sm"
                @change="(e: Event) => emit('patch', { snoozed_until: ((e.target as HTMLInputElement).value || null) as any })"
              />
            </div>
          </div>

          <!-- Outcome notes -->
          <div>
            <p class="text-xs text-muted mb-1">Outcome notes</p>
            <UTextarea
              v-model="outcomeNotesDraft"
              :rows="5"
              size="sm"
              placeholder="What happened after acting on this?"
            />
            <div class="flex justify-end mt-2">
              <UButton
                size="xs"
                :disabled="outcomeNotesDraft === (rec.outcome_notes ?? '')"
                @click="emit('patch', { outcome_notes: outcomeNotesDraft })"
              >Save notes</UButton>
            </div>
          </div>

          <!-- Discussion -->
          <AdvisorDrawerComments
            :recommendation-id="rec.id"
            :comments="comments"
            :current-user-id="currentUserId"
            :can-privileged-edit="canPrivilegedEdit"
            @changed="emit('comments-changed')"
          />

          <!-- Relationship graph -->
          <div v-if="graph && graph.nodes.length > 1">
            <p class="text-[10px] uppercase text-muted font-semibold tracking-wider mb-2">Relationships</p>
            <AdvisorGraph :data="graph" @select="(node: GraphNode) => emit('graph-select', node)" />
          </div>

          <!-- Related past advice -->
          <div v-if="similar.length">
            <p class="text-[10px] uppercase text-muted font-semibold tracking-wider mb-2">Related past advice</p>
            <div class="space-y-2">
              <div
                v-for="m in similar"
                :key="m.id"
                class="p-3 rounded-lg border border-default space-y-1 cursor-pointer hover:bg-elevated/60 transition-colors"
                @click="emit('open-similar', m)"
              >
                <div class="flex items-center justify-between gap-2">
                  <p class="font-medium text-sm truncate">{{ m.title }}</p>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <UBadge :color="statusColor(m.status)" variant="subtle" size="xs">{{ statusLabel(m.status) }}</UBadge>
                    <span class="text-[10px] text-muted font-mono">{{ (m.score * 100).toFixed(0) }}%</span>
                  </div>
                </div>
                <p class="text-xs text-muted truncate">{{ m.action }}</p>
                <div class="flex items-center gap-2 text-[10px] text-muted">
                  <span v-if="m.period_label">{{ m.period_label }}</span>
                  <span v-if="m.client_name">· {{ m.client_name }}</span>
                  <span v-if="m.assignee_name">· {{ m.assignee_name }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Outcomes / impact attribution -->
          <div v-if="rec.target_metric || outcomes.length">
            <p class="text-[10px] uppercase text-muted font-semibold tracking-wider mb-2">Impact attribution</p>

            <div v-if="rec.target_metric" class="flex items-center justify-between p-3 rounded-lg border border-default mb-2">
              <div>
                <p class="text-xs text-muted">Tracking</p>
                <p class="text-sm font-medium">{{ METRIC_META[rec.target_metric]?.label ?? rec.target_metric }}</p>
              </div>
              <div class="text-right">
                <p class="text-xs text-muted flex items-center gap-1 justify-end">
                  Target <UIcon :name="rec.target_direction === 'up' ? 'i-lucide-arrow-up-right' : 'i-lucide-arrow-down-right'" class="size-3" />
                </p>
                <p class="text-sm font-mono">Baseline: {{ formatMetric(rec.baseline_metric_value, rec.target_metric) }}</p>
              </div>
            </div>

            <div v-if="outcomes.length" class="space-y-2">
              <div
                v-for="o in outcomes"
                :key="o.id"
                class="p-3 rounded-lg border border-default"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <UBadge color="neutral" variant="subtle" size="xs">Day {{ o.days_after_action ?? '—' }}</UBadge>
                    <span class="text-[10px] text-muted">{{ formatDate(o.measured_at) }}</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="text-xs text-muted font-mono">{{ formatMetric(rec.baseline_metric_value, rec.target_metric) }}</span>
                    <UIcon name="i-lucide-arrow-right" class="size-3 text-muted" />
                    <span class="text-sm font-semibold font-mono">{{ formatMetric(o.metric_value, rec.target_metric) }}</span>
                  </div>
                </div>
                <div
                  v-if="o.metric_delta != null"
                  class="mt-1 text-right text-xs font-medium"
                  :class="{
                    'text-emerald-500': deltaDirection(o.metric_delta, rec.target_direction) === 'good',
                    'text-red-500': deltaDirection(o.metric_delta, rec.target_direction) === 'bad',
                    'text-muted': deltaDirection(o.metric_delta, rec.target_direction) === 'neutral',
                  }"
                >
                  {{ formatDelta(o.metric_delta, rec.target_metric) }}
                  <span v-if="deltaDirection(o.metric_delta, rec.target_direction) === 'good'" class="ml-1">✓ target direction</span>
                  <span v-else-if="deltaDirection(o.metric_delta, rec.target_direction) === 'bad'" class="ml-1">✗ wrong direction</span>
                </div>
                <p v-if="o.notes" class="mt-1 text-[11px] text-muted italic">{{ o.notes }}</p>
              </div>
            </div>

            <div
              v-else-if="rec.target_metric && rec.status === 'done' && rec.acted_at"
              class="p-3 rounded-lg border border-dashed border-default text-xs text-muted text-center"
            >
              Pending measurement — first checkpoint 30 days after action.
            </div>
          </div>

          <!-- Event log -->
          <div v-if="events.length">
            <p class="text-[10px] uppercase text-muted font-semibold tracking-wider mb-2">Activity</p>
            <div class="space-y-2">
              <div v-for="e in displayedEvents" :key="e.id" class="flex gap-2 items-start text-xs">
                <UAvatar v-if="e.actor_name" :alt="e.actor_name" :src="e.actor_avatar_url ?? undefined" size="2xs" />
                <UIcon v-else name="i-lucide-bot" class="size-4 mt-0.5 text-muted" />
                <div class="flex-1 min-w-0">
                  <p><span class="font-medium">{{ e.actor_name ?? 'System' }}</span> <span class="text-muted">{{ eventLabel(e) }}</span></p>
                  <p class="text-[10px] text-muted">{{ formatDate(e.created_at) }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Metadata footer -->
          <div class="pt-4 border-t border-default space-y-1 text-xs text-muted">
            <p>Created {{ formatDate(rec.created_at) }}</p>
            <p v-if="rec.acted_at">Acted {{ formatDate(rec.acted_at) }}</p>
            <p v-if="rec.client_name">Client: {{ rec.client_name }}</p>
          </div>
        </div>
      </div>
      <div v-else-if="loading" class="p-5 space-y-3">
        <USkeleton class="h-4 w-2/3" />
        <USkeleton class="h-20" />
      </div>
    </template>
  </USlideover>
</template>
