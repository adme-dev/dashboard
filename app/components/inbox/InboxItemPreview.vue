<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { parseInboxEntity } from '~~/app/utils/inboxEntity'

interface NotificationLike {
  link: string | null
  [key: string]: unknown
}

const props = defineProps<{ notification: NotificationLike }>()

const entity = computed(() => parseInboxEntity(props.notification?.link))

const item = ref<any>(null)
const pending = ref(false)
const failed = ref(false)

async function load() {
  item.value = null
  failed.value = false
  const e = entity.value
  if (!e) return
  pending.value = true
  try {
    item.value = await $fetch(e.apiPath)
  } catch {
    failed.value = true
  } finally {
    pending.value = false
  }
}

watch(() => entity.value?.apiPath, load, { immediate: true })

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

const briefStatusColor: Record<string, string> = {
  draft: 'neutral', submitted: 'info', under_review: 'warning', needs_info: 'warning',
  approved: 'success', in_progress: 'info', completed: 'success', rejected: 'error', cancelled: 'neutral'
}
const priorityColor: Record<string, string> = { low: 'neutral', medium: 'info', high: 'warning', urgent: 'error' }

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

      <!-- the actual brief contents -->
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
  </div>
</template>
