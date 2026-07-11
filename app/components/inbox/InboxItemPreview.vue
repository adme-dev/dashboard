<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { parseInboxEntity } from '~~/app/utils/inboxEntity'

interface NotificationLike {
  link: string | null
}

const props = defineProps<{ notification: NotificationLike }>()

const entity = computed(() => parseInboxEntity(props.notification?.link))

const item = ref<any>(null)
const pending = ref(false)
const failed = ref(false)
const acting = ref(false)
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>

async function load() {
  item.value = null
  failed.value = false
  const e = entity.value
  if (!e) return
  pending.value = true
  try {
    const res: any = await apiFetch(e.apiPath)
    // The anomaly endpoint nests the record under `.anomaly`; tasks/briefs return it directly.
    item.value = e.kind === 'anomaly' ? (res?.anomaly ?? null) : res
    if (!item.value) failed.value = true
  } catch {
    failed.value = true
  } finally {
    pending.value = false
  }
}

watch(() => entity.value?.apiPath, load, { immediate: true })

// ---- anomaly actions (PATCH /api/ai/anomalies/:id) ----
// Available actions per status mirror the server state-machine.
type UiColor = 'error' | 'info' | 'success' | 'primary' | 'secondary' | 'warning' | 'neutral'

const anomalyActions = computed<Array<{ action: string, label: string, icon: string, color: UiColor }>>(() => {
  const s = item.value?.status
  if (entity.value?.kind !== 'anomaly' || !s) return []
  const all = [
    { action: 'acknowledge', label: 'Acknowledge', icon: 'i-lucide-eye', color: 'neutral', when: ['open', 'snoozed'] },
    { action: 'snooze', label: 'Snooze 24h', icon: 'i-lucide-clock', color: 'neutral', when: ['open', 'acknowledged'] },
    { action: 'resolve', label: 'Resolve', icon: 'i-lucide-check', color: 'primary', when: ['open', 'acknowledged', 'snoozed'] },
    { action: 'reopen', label: 'Reopen', icon: 'i-lucide-rotate-ccw', color: 'neutral', when: ['resolved'] }
  ] satisfies Array<{ action: string, label: string, icon: string, color: UiColor, when: string[] }>
  return all.filter(a => a.when.includes(s)).map(({ when, ...a }) => a)
})

async function doAction(action: string) {
  const e = entity.value
  if (!e || acting.value) return
  acting.value = true
  try {
    const body: Record<string, unknown> = { action }
    if (action === 'snooze') body.snoozedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await apiFetch(e.apiPath, { method: 'PATCH', body })
    // Reflect the new status locally (state-machine end states).
    item.value = { ...item.value, status: action === 'resolve' ? 'resolved' : action === 'acknowledge' ? 'acknowledged' : action === 'snooze' ? 'snoozed' : action === 'reopen' ? 'open' : item.value.status }
    toast.add({ title: `Anomaly ${action === 'resolve' ? 'resolved' : action === 'acknowledge' ? 'acknowledged' : action === 'snooze' ? 'snoozed' : 'reopened'}`, color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Action failed', description: err?.data?.statusMessage || err?.message, color: 'error' })
  } finally {
    acting.value = false
  }
}

// ---- formatting helpers ----
function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (Array.isArray(v)) return v.map(fmtValue).join(', ')
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.start !== 'undefined' || typeof o.end !== 'undefined') return `${fmtValue(o.start)} → ${fmtValue(o.end)}`
    return Object.values(o).map(fmtValue).join(', ')
  }
  return String(v)
}

function fmtDate(d: string | null | undefined): string | null {
  if (!d) return null
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return String(d)
  return t.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

const briefStatusColor: Record<string, UiColor> = {
  draft: 'neutral', submitted: 'info', under_review: 'warning', needs_info: 'warning',
  approved: 'success', in_progress: 'info', completed: 'success', rejected: 'error', cancelled: 'neutral'
}
const priorityColor: Record<string, UiColor> = { low: 'neutral', medium: 'info', high: 'warning', urgent: 'error' }
const severityColor: Record<string, UiColor> = { critical: 'error', high: 'warning', medium: 'info', low: 'neutral' }
const anomalyStatusColor: Record<string, UiColor> = { open: 'warning', acknowledged: 'info', snoozed: 'neutral', resolved: 'success', dismissed: 'neutral' }

const briefFields = computed(() =>
  ((item.value?.fieldValues as any[]) || []).filter(f => f?.value !== null && f?.value !== undefined && f?.value !== '')
)
</script>

<template>
  <div class="mt-1">
    <!-- loading -->
    <div v-if="pending" class="space-y-3">
      <USkeleton class="h-5 w-2/3" />
      <USkeleton class="h-4 w-1/3" />
      <USkeleton class="h-16 w-full" />
    </div>

    <!-- failed: graceful fallback -->
    <UAlert
      v-else-if="failed"
      icon="i-lucide-triangle-alert"
      color="neutral"
      variant="subtle"
      :title="`Couldn't load this ${entity?.label.toLowerCase()} preview`"
      description="It may have been deleted or you may not have access. Use the button below to open it."
    />

    <!-- TASK preview -->
    <div v-else-if="item && entity?.kind === 'task'" class="space-y-4">
      <div>
        <div class="flex items-center gap-2 text-xs text-dimmed mb-1">
          <UIcon name="i-lucide-square-check-big" class="h-3.5 w-3.5" />
          <span>Task{{ item.parent_title ? ` · under “${item.parent_title}”` : '' }}</span>
        </div>
        <h3 class="text-base font-semibold text-highlighted">
          {{ item.title }}
        </h3>
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <div v-if="item.status_name" class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: item.status_color || '#a1a1aa' }" />
          <span class="text-muted">{{ item.status_name }}</span>
        </div>
        <UBadge
          v-if="item.priority"
          :label="item.priority"
          :color="priorityColor[item.priority] || 'neutral'"
          variant="subtle"
          size="xs"
          class="capitalize"
        />
        <div v-if="item.assignee_name" class="flex items-center gap-1.5 text-muted">
          <UIcon name="i-lucide-user" class="h-3.5 w-3.5" />
          <span>{{ item.assignee_name }}</span>
        </div>
        <div v-if="fmtDate(item.due_date)" class="flex items-center gap-1.5 text-muted">
          <UIcon name="i-lucide-calendar" class="h-3.5 w-3.5" />
          <span>{{ fmtDate(item.due_date) }}</span>
        </div>
      </div>

      <div v-if="item.description" class="text-sm text-muted whitespace-pre-wrap line-clamp-6 border-l-2 border-default pl-3">
        {{ item.description }}
      </div>
    </div>

    <!-- BRIEF preview -->
    <div v-else-if="item && entity?.kind === 'brief'" class="space-y-4">
      <div>
        <div class="flex items-center gap-2 text-xs text-dimmed mb-1">
          <UIcon name="i-lucide-file-text" class="h-3.5 w-3.5" />
          <span>Brief{{ item.referenceNumber ? ` · ${item.referenceNumber}` : '' }}</span>
        </div>
        <h3 class="text-base font-semibold text-highlighted">
          {{ item.title || 'Untitled brief' }}
        </h3>
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <UBadge
          v-if="item.status"
          :label="String(item.status).replace(/_/g, ' ')"
          :color="briefStatusColor[item.status] || 'neutral'"
          variant="subtle"
          size="xs"
          class="capitalize"
        />
        <UBadge
          v-if="item.priority"
          :label="item.priority"
          :color="priorityColor[item.priority] || 'neutral'"
          variant="subtle"
          size="xs"
          class="capitalize"
        />
        <div v-if="item.submittedByName" class="flex items-center gap-1.5 text-muted">
          <UIcon name="i-lucide-user" class="h-3.5 w-3.5" />
          <span>{{ item.submittedByName }}</span>
        </div>
        <div v-if="fmtDate(item.submittedAt)" class="flex items-center gap-1.5 text-muted">
          <UIcon name="i-lucide-calendar" class="h-3.5 w-3.5" />
          <span>{{ fmtDate(item.submittedAt) }}</span>
        </div>
      </div>

      <dl v-if="briefFields.length" class="space-y-2.5">
        <div v-for="f in briefFields" :key="f.fieldId || f.fieldKey" class="text-sm">
          <dt class="text-xs font-medium text-dimmed uppercase tracking-wide">
            {{ f.fieldLabel }}
          </dt>
          <dd class="text-highlighted mt-0.5 whitespace-pre-wrap line-clamp-4">
            {{ fmtValue(f.value) }}
          </dd>
        </div>
      </dl>
      <p v-else class="text-sm text-muted italic">
        No fields filled in yet.
      </p>
    </div>

    <!-- ANOMALY preview + actions -->
    <div v-else-if="item && entity?.kind === 'anomaly'" class="space-y-4">
      <div>
        <div class="flex items-center gap-2 text-xs text-dimmed mb-1">
          <UIcon name="i-lucide-activity" class="h-3.5 w-3.5" />
          <span>Anomaly{{ item.metric ? ` · ${item.metric}` : '' }}</span>
        </div>
        <h3 class="text-base font-semibold text-highlighted">
          {{ item.title }}
        </h3>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-sm">
        <UBadge
          v-if="item.severity"
          :label="item.severity"
          :color="severityColor[item.severity] || 'neutral'"
          variant="subtle"
          size="xs"
          class="capitalize"
        />
        <UBadge
          v-if="item.status"
          :label="item.status"
          :color="anomalyStatusColor[item.status] || 'neutral'"
          variant="outline"
          size="xs"
          class="capitalize"
        />
        <span v-if="fmtDate(item.last_detected_at || item.first_detected_at)" class="text-xs text-dimmed">
          detected {{ fmtDate(item.last_detected_at || item.first_detected_at) }}
        </span>
      </div>

      <p v-if="item.description" class="text-sm text-muted whitespace-pre-wrap">
        {{ item.description }}
      </p>

      <!-- recommendation: the "what to do" -->
      <div v-if="item.recommendation" class="rounded-md bg-primary/5 border border-primary/20 p-3">
        <div class="flex items-center gap-1.5 text-xs font-medium text-primary mb-1">
          <UIcon name="i-lucide-lightbulb" class="h-3.5 w-3.5" />
          Recommendation
        </div>
        <p class="text-sm text-highlighted whitespace-pre-wrap">
          {{ item.recommendation }}
        </p>
      </div>

      <!-- AI driver narrative, if present -->
      <div v-if="item.driver_narrative" class="text-sm text-muted whitespace-pre-wrap border-l-2 border-default pl-3">
        {{ item.driver_narrative }}
      </div>

      <!-- actions -->
      <div v-if="anomalyActions.length" class="flex flex-wrap items-center gap-2 pt-1">
        <UButton
          v-for="a in anomalyActions"
          :key="a.action"
          :label="a.label"
          :icon="a.icon"
          :color="a.color"
          :variant="a.color === 'primary' ? 'solid' : 'outline'"
          size="xs"
          :loading="acting"
          :disabled="acting"
          @click="doAction(a.action)"
        />
      </div>
    </div>
  </div>
</template>
