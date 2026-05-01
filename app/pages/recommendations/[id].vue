<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

const route = useRoute()
const router = useRouter()
const toast = useToast()

interface Recommendation {
  id: string
  title: string
  action: string
  impact: string | null
  priority: 'high' | 'medium' | 'low'
  status: 'open' | 'in_progress' | 'done' | 'dismissed'
  category: string | null
  effort: string | null
  client_id: string | null
  client_name: string | null
  assignee_name: string | null
  assignee_avatar_url: string | null
  due_date: string | null
  snoozed_until: string | null
  source: 'ai' | 'manual'
  created_at: string
  updated_at: string
  acted_at: string | null
  outcome_notes: string | null
  target_metric: string | null
  baseline_metric_value: number | null
  target_direction: 'up' | 'down' | null
  xero_metric_snapshot: Record<string, any> | null
}

interface Event {
  id: string
  event_type: string
  actor_id: string | null
  actor_name: string | null
  actor_avatar_url: string | null
  payload: Record<string, any> | null
  created_at: string
}

interface Outcome {
  id: string
  measured_at: string
  days_after_action: number | null
  metric_value: number | null
  metric_delta: number | null
  notes: string | null
}

interface Comment {
  id: string
  body: string
  created_at: string
  updated_at: string
  author_name: string | null
  author_avatar_url: string | null
}

interface DetailResponse {
  recommendation: Recommendation
  events: Event[]
  outcomes: Outcome[]
  comments: Comment[]
}

const id = computed(() => String(route.params.id))

const { data, pending, error, refresh } = await useFetch<DetailResponse>(
  () => `/api/advisor/recommendations/${id.value}`,
  { lazy: true }
)

const rec = computed(() => data.value?.recommendation)
const events = computed(() => data.value?.events ?? [])
const outcomes = computed(() => data.value?.outcomes ?? [])
const comments = computed(() => data.value?.comments ?? [])

const newComment = ref('')
const posting = ref(false)

async function patchRec(body: Record<string, any>, successMsg: string) {
  try {
    await $fetch(`/api/advisor/recommendations/${id.value}`, { method: 'PATCH', body })
    toast.add({ title: successMsg, color: 'success' })
    await refresh()
  } catch (err: any) {
    toast.add({
      title: 'Update failed',
      description: err?.data?.statusMessage || err?.message || 'Unknown error',
      color: 'error',
    })
  }
}

function snooze7d() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return patchRec({ snoozed_until: `${yyyy}-${mm}-${dd}` }, 'Snoozed 7 days')
}

async function postComment() {
  if (!newComment.value.trim()) return
  posting.value = true
  try {
    await $fetch(`/api/advisor/recommendations/${id.value}/comments`, {
      method: 'POST',
      body: { body: newComment.value.trim() },
    })
    newComment.value = ''
    await refresh()
    toast.add({ title: 'Comment posted', color: 'success' })
  } catch (err: any) {
    toast.add({
      title: 'Failed to post comment',
      description: err?.data?.statusMessage || err?.message || 'Unknown error',
      color: 'error',
    })
  } finally {
    posting.value = false
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const priorityColor: Record<'high' | 'medium' | 'low', 'error' | 'warning' | 'neutral'> = {
  high: 'error',
  medium: 'warning',
  low: 'neutral',
}

const statusColor: Record<string, 'neutral' | 'info' | 'success' | 'error'> = {
  open: 'neutral',
  in_progress: 'info',
  done: 'success',
  dismissed: 'error',
}

const eventTypeLabel: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  comment_added: 'Commented',
}

function snapshotEntries(snap: Record<string, any> | null): Array<[string, any]> {
  if (!snap) return []
  return Object.entries(snap).filter(([k]) => k !== 'generatedAt')
}

function renderSnapshotValue(key: string, value: any): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') {
    // Heuristic: small numbers are likely percents/ratios; large are currency
    if (Math.abs(value) < 10 && key.toLowerCase().includes('pct')) {
      return `${(value * 100).toFixed(1)}%`
    }
    if (Math.abs(value) < 10 && (key.toLowerCase().includes('variance') || key.toLowerCase().includes('ratio'))) {
      return `${(value * 100).toFixed(1)}%`
    }
    if (key.toLowerCase().match(/(amount|spend|budget|outstanding|expected|actual)/)) {
      return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
    }
    return value.toLocaleString()
  }
  return String(value)
}
</script>

<template>
  <UDashboardPanel id="recommendation-detail">
    <template #header>
      <UDashboardNavbar :title="rec?.title || 'Recommendation'">
        <template #leading>
          <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" @click="router.push('/recommendations')">
            Back
          </UButton>
        </template>
        <template #right>
          <UButton
            v-if="rec && ['open', 'in_progress'].includes(rec.status)"
            color="success" variant="soft" size="sm"
            icon="i-lucide-check"
            @click="patchRec({ status: 'done' }, 'Marked done')"
          >Mark done</UButton>
          <UButton
            v-if="rec && ['open', 'in_progress'].includes(rec.status)"
            color="neutral" variant="ghost" size="sm"
            icon="i-lucide-clock"
            @click="snooze7d"
          >Snooze 7d</UButton>
          <UButton
            v-if="rec && ['open', 'in_progress'].includes(rec.status)"
            color="neutral" variant="ghost" size="sm"
            icon="i-lucide-x"
            @click="patchRec({ status: 'dismissed' }, 'Dismissed')"
          >Dismiss</UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="pending" class="p-6 space-y-3">
        <USkeleton class="h-6 w-1/2" />
        <USkeleton class="h-32 w-full" />
        <USkeleton class="h-24 w-full" />
      </div>

      <UAlert v-else-if="error" color="error" title="Failed to load" :description="String(error)" class="m-6" />

      <div v-else-if="rec" class="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main column -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Badges + meta -->
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <UBadge :color="priorityColor[rec.priority]" variant="soft">{{ rec.priority }}</UBadge>
            <UBadge :color="statusColor[rec.status]" variant="subtle">{{ rec.status.replace('_', ' ') }}</UBadge>
            <UBadge v-if="rec.category" color="neutral" variant="outline">{{ rec.category }}</UBadge>
            <UBadge v-if="rec.source === 'ai'" color="primary" variant="subtle">
              <UIcon name="i-lucide-sparkles" class="size-3 mr-1" />AI
            </UBadge>
            <span class="text-muted">created {{ timeAgo(rec.created_at) }}</span>
          </div>

          <!-- Title -->
          <h1 class="text-2xl font-semibold leading-tight">{{ rec.title }}</h1>

          <!-- Action -->
          <UCard>
            <h3 class="text-sm font-medium text-muted uppercase tracking-wide mb-2">Recommended action</h3>
            <p class="text-base leading-relaxed">{{ rec.action }}</p>
            <p v-if="rec.impact" class="text-sm text-emerald-700 dark:text-emerald-400 italic mt-3">
              {{ rec.impact }}
            </p>
          </UCard>

          <!-- Snapshot data -->
          <UCard v-if="rec.xero_metric_snapshot">
            <h3 class="text-sm font-medium text-muted uppercase tracking-wide mb-3">Source data</h3>
            <dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <template v-for="[key, val] in snapshotEntries(rec.xero_metric_snapshot)" :key="key">
                <dt class="text-muted">{{ key }}</dt>
                <dd class="font-medium">{{ renderSnapshotValue(key, val) }}</dd>
              </template>
            </dl>
          </UCard>

          <!-- Comments -->
          <UCard>
            <h3 class="text-sm font-medium text-muted uppercase tracking-wide mb-3">
              Comments ({{ comments.length }})
            </h3>

            <div v-if="comments.length" class="space-y-3 mb-4">
              <div v-for="c in comments" :key="c.id" class="flex gap-3">
                <UAvatar :src="c.author_avatar_url ?? undefined" :alt="c.author_name ?? 'User'" size="sm" />
                <div class="flex-1 min-w-0">
                  <div class="flex items-baseline gap-2 text-xs text-muted">
                    <span class="font-medium text-default">{{ c.author_name || 'Unknown' }}</span>
                    <span>{{ timeAgo(c.created_at) }}</span>
                  </div>
                  <p class="text-sm mt-1 whitespace-pre-wrap">{{ c.body }}</p>
                </div>
              </div>
            </div>

            <div class="flex gap-2">
              <UTextarea
                v-model="newComment"
                placeholder="Add a comment…"
                :rows="2"
                autoresize
                class="flex-1"
                @keydown.meta.enter="postComment"
                @keydown.ctrl.enter="postComment"
              />
              <UButton
                color="primary" size="sm"
                icon="i-lucide-send"
                :loading="posting"
                :disabled="!newComment.trim()"
                @click="postComment"
              >Post</UButton>
            </div>
          </UCard>
        </div>

        <!-- Sidebar -->
        <aside class="space-y-4">
          <UCard>
            <h3 class="text-sm font-medium text-muted uppercase tracking-wide mb-3">Details</h3>
            <dl class="space-y-2 text-sm">
              <div v-if="rec.client_name" class="flex justify-between">
                <dt class="text-muted">Client</dt>
                <dd class="font-medium">{{ rec.client_name }}</dd>
              </div>
              <div v-if="rec.assignee_name" class="flex justify-between">
                <dt class="text-muted">Assigned to</dt>
                <dd class="font-medium">{{ rec.assignee_name }}</dd>
              </div>
              <div v-if="rec.due_date" class="flex justify-between">
                <dt class="text-muted">Due</dt>
                <dd class="font-medium">{{ rec.due_date }}</dd>
              </div>
              <div v-if="rec.snoozed_until" class="flex justify-between">
                <dt class="text-muted">Snoozed until</dt>
                <dd class="font-medium">{{ rec.snoozed_until }}</dd>
              </div>
              <div v-if="rec.target_metric" class="flex justify-between">
                <dt class="text-muted">Target metric</dt>
                <dd class="font-medium">{{ rec.target_metric }}</dd>
              </div>
              <div v-if="rec.baseline_metric_value !== null" class="flex justify-between">
                <dt class="text-muted">Baseline</dt>
                <dd class="font-medium">{{ rec.baseline_metric_value }} ({{ rec.target_direction === 'down' ? '↓ goal' : '↑ goal' }})</dd>
              </div>
              <div v-if="rec.acted_at" class="flex justify-between">
                <dt class="text-muted">Acted</dt>
                <dd class="font-medium">{{ timeAgo(rec.acted_at) }}</dd>
              </div>
            </dl>
          </UCard>

          <!-- Outcomes -->
          <UCard v-if="outcomes.length">
            <h3 class="text-sm font-medium text-muted uppercase tracking-wide mb-3">
              Outcomes ({{ outcomes.length }})
            </h3>
            <ul class="space-y-2 text-sm">
              <li v-for="o in outcomes" :key="o.id" class="border-b border-default pb-2 last:border-0">
                <div class="flex justify-between">
                  <span class="text-muted">{{ o.days_after_action ?? '?' }}d after</span>
                  <span class="font-medium">{{ o.metric_value }}</span>
                </div>
                <div v-if="o.metric_delta !== null" class="text-xs text-muted">
                  Δ {{ o.metric_delta }}
                </div>
                <p v-if="o.notes" class="text-xs mt-1">{{ o.notes }}</p>
              </li>
            </ul>
          </UCard>

          <!-- Activity log -->
          <UCard>
            <h3 class="text-sm font-medium text-muted uppercase tracking-wide mb-3">
              Activity ({{ events.length }})
            </h3>
            <ul class="space-y-3 text-sm">
              <li v-for="e in events" :key="e.id" class="flex gap-2">
                <UIcon name="i-lucide-circle-dot" class="size-3 mt-1.5 text-muted shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="text-xs">
                    <span class="font-medium">{{ e.actor_name || 'System' }}</span>
                    <span class="text-muted"> · {{ eventTypeLabel[e.event_type] || e.event_type }}</span>
                  </div>
                  <div class="text-xs text-muted">{{ fmtDate(e.created_at) }}</div>
                </div>
              </li>
            </ul>
          </UCard>
        </aside>
      </div>
    </template>
  </UDashboardPanel>
</template>
