<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

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
  comment_count: number
  target_metric: string | null
  baseline_metric_value: number | null
  target_direction: 'up' | 'down' | null
}

interface ListResponse {
  recommendations: Recommendation[]
  total: number
}

const toast = useToast()

const statusFilter = ref<'active' | 'done' | 'dismissed'>('active')
const priorityFilter = ref<'all' | 'high' | 'medium' | 'low'>('all')
const categoryFilter = ref<string>('all')

const apiQuery = computed(() => {
  const params: Record<string, string> = {}
  if (statusFilter.value === 'active') params.status = 'open,in_progress'
  else if (statusFilter.value === 'done') params.status = 'done'
  else if (statusFilter.value === 'dismissed') params.status = 'dismissed'
  if (priorityFilter.value !== 'all') params.priority = priorityFilter.value
  if (categoryFilter.value !== 'all') params.category = categoryFilter.value
  return params
})

const { data, pending, error, refresh } = await useFetch<ListResponse>('/api/advisor/recommendations', {
  query: apiQuery,
  watch: [apiQuery],
  lazy: true,
})

const recs = computed(() => data.value?.recommendations ?? [])

const grouped = computed(() => {
  const buckets: Record<'high' | 'medium' | 'low', Recommendation[]> = { high: [], medium: [], low: [] }
  for (const r of recs.value) buckets[r.priority]?.push(r)
  return buckets
})

const generating = ref(false)

interface GenerateResult { created: number; skipped: number; total: number; scanned: number; reason?: string }

async function runGenerator(path: string): Promise<GenerateResult & { label: string; ok: boolean }> {
  const label = path.split('/').pop() || path
  try {
    const result = await $fetch<GenerateResult>(path, { method: 'POST' })
    return { ...result, label, ok: true }
  } catch (err: any) {
    console.warn(`[generator] ${label} failed:`, err)
    return {
      label, ok: false, created: 0, skipped: 0, total: 0, scanned: 0,
      reason: err?.data?.statusMessage || err?.message || 'failed',
    }
  }
}

async function generateAll() {
  generating.value = true
  try {
    const results = await Promise.all([
      runGenerator('/api/advisor/generate/collections'),
      runGenerator('/api/advisor/generate/ad-pacing'),
      runGenerator('/api/advisor/generate/project-burn'),
    ])
    const totalCreated = results.reduce((s, r) => s + r.created, 0)
    const failed = results.filter((r) => !r.ok)
    const summary = results.map((r) => `${r.label}: ${r.ok ? `${r.created} new` : 'failed'}`).join(' · ')
    toast.add({
      title: totalCreated > 0
        ? `${totalCreated} new recommendation${totalCreated === 1 ? '' : 's'}`
        : 'Inbox up to date',
      description: summary,
      color: failed.length > 0 ? 'warning' : (totalCreated > 0 ? 'success' : 'info'),
    })
    await refresh()
  } finally {
    generating.value = false
  }
}

async function patchRec(id: string, body: Record<string, any>, successMsg: string) {
  try {
    await $fetch(`/api/advisor/recommendations/${id}`, { method: 'PATCH', body })
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

function markInProgress(id: string) {
  return patchRec(id, { status: 'in_progress' }, 'Moved to In Progress')
}
function markDone(id: string) {
  return patchRec(id, { status: 'done' }, 'Marked done')
}
function dismiss(id: string) {
  return patchRec(id, { status: 'dismissed' }, 'Dismissed')
}
function snooze7d(id: string) {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return patchRec(id, { snoozed_until: `${yyyy}-${mm}-${dd}` }, 'Snoozed 7 days')
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
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

const priorityConfig: Record<'high' | 'medium' | 'low', { color: 'error' | 'warning' | 'neutral'; label: string; icon: string }> = {
  high: { color: 'error', label: 'High', icon: 'i-lucide-flame' },
  medium: { color: 'warning', label: 'Medium', icon: 'i-lucide-alert-triangle' },
  low: { color: 'neutral', label: 'Low', icon: 'i-lucide-info' },
}

const categoryLabels: Record<string, string> = {
  cashflow: 'Cashflow',
  collections: 'Collections',
  pricing: 'Pricing',
  margin: 'Margin',
  'cost-control': 'Cost control',
  growth: 'Growth',
  staffing: 'Staffing',
  'tax-compliance': 'Tax & compliance',
  risk: 'Risk',
}

const statusItems = [
  { label: 'Active', value: 'active' },
  { label: 'Done', value: 'done' },
  { label: 'Dismissed', value: 'dismissed' },
]
const priorityItems = [
  { label: 'All priorities', value: 'all' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
]
const categoryItems = [
  { label: 'All categories', value: 'all' },
  ...Object.entries(categoryLabels).map(([value, label]) => ({ label, value })),
]
</script>

<template>
  <UDashboardPanel id="recommendations">
    <template #header>
      <UDashboardNavbar title="Recommendations">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            color="primary"
            icon="i-lucide-sparkles"
            :loading="generating"
            @click="generateAll"
          >
            Scan all sources
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6 p-4 sm:p-6">
        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-2">
          <USelectMenu
            v-model="statusFilter"
            :items="statusItems"
            value-key="value"
            class="min-w-32"
          />
          <USelectMenu
            v-model="priorityFilter"
            :items="priorityItems"
            value-key="value"
            class="min-w-36"
          />
          <USelectMenu
            v-model="categoryFilter"
            :items="categoryItems"
            value-key="value"
            class="min-w-40"
          />
          <div class="ml-auto text-sm text-muted">
            <span v-if="!pending">{{ recs.length }} {{ recs.length === 1 ? 'item' : 'items' }}</span>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="pending && !recs.length" class="space-y-3">
          <USkeleton v-for="n in 3" :key="n" class="h-24 w-full" />
        </div>

        <!-- Error -->
        <UAlert v-else-if="error" color="error" :title="'Failed to load recommendations'" :description="String(error)" />

        <!-- Empty state -->
        <UCard v-else-if="!recs.length" class="text-center">
          <div class="py-10 space-y-3">
            <UIcon name="i-lucide-sparkles" class="size-10 text-muted mx-auto" />
            <div class="text-base font-medium">No {{ statusFilter === 'active' ? 'open' : statusFilter }} recommendations</div>
            <p class="text-sm text-muted max-w-sm mx-auto">
              {{ statusFilter === 'active'
                ? 'Click "Scan all sources" to check Xero AR, ad-spend pacing, and project burn rates.'
                : 'Nothing here yet.' }}
            </p>
          </div>
        </UCard>

        <!-- Grouped by priority -->
        <template v-else>
          <section
            v-for="bucket in (['high', 'medium', 'low'] as const)"
            :key="bucket"
            v-show="grouped[bucket].length > 0"
            class="space-y-3"
          >
            <div class="flex items-center gap-2">
              <UIcon :name="priorityConfig[bucket].icon" :class="{
                'text-red-500': bucket === 'high',
                'text-yellow-500': bucket === 'medium',
                'text-muted': bucket === 'low',
              }" />
              <h2 class="text-sm font-semibold uppercase tracking-wide">
                {{ priorityConfig[bucket].label }} priority
              </h2>
              <UBadge color="neutral" variant="subtle" size="sm">{{ grouped[bucket].length }}</UBadge>
            </div>

            <ul class="space-y-3">
              <li v-for="rec in grouped[bucket]" :key="rec.id">
                <UCard
                  class="hover:ring-2 hover:ring-primary/20 transition cursor-pointer"
                  @click="navigateTo(`/recommendations/${rec.id}`)"
                >
                  <div class="flex flex-col gap-3">
                    <!-- Header row: badges + meta -->
                    <div class="flex flex-wrap items-center gap-2 text-xs">
                      <UBadge :color="priorityConfig[rec.priority].color" variant="soft" size="sm">
                        {{ priorityConfig[rec.priority].label }}
                      </UBadge>
                      <UBadge v-if="rec.category" color="neutral" variant="outline" size="sm">
                        {{ categoryLabels[rec.category] ?? rec.category }}
                      </UBadge>
                      <UBadge v-if="rec.source === 'ai'" color="primary" variant="subtle" size="sm">
                        <UIcon name="i-lucide-sparkles" class="size-3 mr-1" />AI
                      </UBadge>
                      <UBadge v-if="rec.status === 'in_progress'" color="info" variant="subtle" size="sm">
                        In Progress
                      </UBadge>
                      <span class="ml-auto text-muted">{{ timeAgo(rec.created_at) }}</span>
                    </div>

                    <!-- Title + body -->
                    <div class="space-y-1">
                      <div class="text-base font-medium leading-snug">{{ rec.title }}</div>
                      <p class="text-sm text-muted leading-relaxed">{{ rec.action }}</p>
                      <p v-if="rec.impact" class="text-sm text-emerald-700 dark:text-emerald-400 italic">
                        {{ rec.impact }}
                      </p>
                    </div>

                    <!-- Footer: client + actions -->
                    <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-default">
                      <div v-if="rec.client_name" class="flex items-center gap-1.5 text-xs text-muted">
                        <UIcon name="i-lucide-building-2" class="size-3.5" />
                        {{ rec.client_name }}
                      </div>
                      <div v-if="rec.assignee_name" class="flex items-center gap-1.5 text-xs text-muted">
                        <UAvatar :src="rec.assignee_avatar_url ?? undefined" :alt="rec.assignee_name" size="3xs" />
                        {{ rec.assignee_name }}
                      </div>
                      <div v-if="rec.snoozed_until" class="text-xs text-muted">
                        💤 Snoozed until {{ rec.snoozed_until }}
                      </div>

                      <div class="ml-auto flex flex-wrap gap-1.5">
                        <UButton
                          v-if="rec.status === 'open'"
                          size="xs" color="neutral" variant="soft"
                          icon="i-lucide-play"
                          @click.stop="markInProgress(rec.id)"
                        >In progress</UButton>
                        <UButton
                          v-if="['open', 'in_progress'].includes(rec.status)"
                          size="xs" color="success" variant="soft"
                          icon="i-lucide-check"
                          @click.stop="markDone(rec.id)"
                        >Done</UButton>
                        <UButton
                          v-if="['open', 'in_progress'].includes(rec.status)"
                          size="xs" color="neutral" variant="ghost"
                          icon="i-lucide-clock"
                          @click.stop="snooze7d(rec.id)"
                        >Snooze 7d</UButton>
                        <UButton
                          v-if="['open', 'in_progress'].includes(rec.status)"
                          size="xs" color="neutral" variant="ghost"
                          icon="i-lucide-x"
                          @click.stop="dismiss(rec.id)"
                        >Dismiss</UButton>
                      </div>
                    </div>
                  </div>
                </UCard>
              </li>
            </ul>
          </section>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
