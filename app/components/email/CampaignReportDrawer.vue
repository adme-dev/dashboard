<!-- app/components/email/CampaignReportDrawer.vue -->
<script setup lang="ts">
import { ref, watch } from 'vue'

interface EventsSummary {
  sent: number
  delivered: number
  opened: number
  opened_label: string
  clicked: number
  human_clicked: number
  bounced: number
  complained: number
  unsubscribed: number
}

interface CampaignEventRow {
  id: string
  event_type: string
  subscriber_email?: string | null
  subscriber_name?: string | null
  suspected_scanner?: boolean
  metric_note?: string | null
  url?: string | null
  occurred_at?: string | null
}

interface AttributionSummary {
  website_events: number
  sessions: number
  page_views: number
  conversions: number
  click_attributed_events: number
  leads: number
}

interface AttributionSession {
  session_id: string | null
  anon_id: string
  events: number
  conversions: number
  email_click_ids?: string[] | null
  first_seen_at?: string | null
  last_seen_at?: string | null
}

const props = defineProps<{
  campaignId: string | null
  campaignName?: string
}>()
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const pending = ref(false)
const eventsSummary = ref<EventsSummary | null>(null)
const events = ref<CampaignEventRow[]>([])
const attributionSummary = ref<AttributionSummary | null>(null)
const sessions = ref<AttributionSession[]>([])

function formatDate(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function metricColor(value: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  if (value === 'delivered' || value === 'sent') return 'success'
  if (value === 'opened' || value === 'clicked') return 'info'
  if (value === 'bounced' || value === 'complained' || value === 'unsubscribed') return 'error'
  if (value === 'delivery_delayed') return 'warning'
  return 'neutral'
}

async function load() {
  if (!open.value || !props.campaignId) return
  pending.value = true
  try {
    const [eventResult, attributionResult] = await Promise.all([
      $fetch<{ summary: EventsSummary, events: CampaignEventRow[] }>(`/api/email/campaigns/${props.campaignId}/events`),
      $fetch<{ summary: AttributionSummary, sessions: AttributionSession[] }>(`/api/email/campaigns/${props.campaignId}/attribution`)
    ])
    eventsSummary.value = eventResult.summary
    events.value = eventResult.events
    attributionSummary.value = attributionResult.summary
    sessions.value = attributionResult.sessions
  } catch (e) {
    const err = e as { data?: { statusMessage?: string } }
    toast.add({
      title: 'Campaign report failed',
      description: err.data?.statusMessage,
      color: 'error'
    })
  } finally {
    pending.value = false
  }
}

watch([open, () => props.campaignId], load, { immediate: true })
</script>

<template>
  <USlideover :open="open" :ui="{ content: 'max-w-4xl' }" @update:open="open = $event">
    <template #content>
      <div class="flex h-full flex-col">
        <div class="flex items-start justify-between gap-4 border-b border-default p-5">
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase text-muted">
              Campaign Report
            </p>
            <h3 class="mt-1 truncate text-lg font-semibold">
              {{ campaignName ?? 'Campaign' }}
            </h3>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="open = false"
          />
        </div>

        <div v-if="pending" class="space-y-3 p-5">
          <USkeleton class="h-20 w-full" />
          <USkeleton class="h-40 w-full" />
        </div>

        <div v-else class="flex-1 overflow-auto p-5 space-y-6">
          <section class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <h4 class="text-sm font-semibold">
                Delivery And Engagement
              </h4>
              <UBadge color="info" variant="subtle">
                Opens are directional
              </UBadge>
            </div>
            <div class="grid gap-2 sm:grid-cols-4">
              <div class="rounded-lg border border-default p-3">
                <p class="text-xs text-muted">
                  Delivered
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ eventsSummary?.delivered ?? 0 }}
                </p>
              </div>
              <div class="rounded-lg border border-default p-3">
                <p class="text-xs text-muted">
                  Opened
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ eventsSummary?.opened ?? 0 }}
                </p>
              </div>
              <div class="rounded-lg border border-default p-3">
                <p class="text-xs text-muted">
                  Clicked
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ eventsSummary?.clicked ?? 0 }}
                </p>
              </div>
              <div class="rounded-lg border border-default p-3">
                <p class="text-xs text-muted">
                  Human-clicked
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ eventsSummary?.human_clicked ?? 0 }}
                </p>
              </div>
              <div class="rounded-lg border border-default p-3">
                <p class="text-xs text-muted">
                  Bounced
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ eventsSummary?.bounced ?? 0 }}
                </p>
              </div>
              <div class="rounded-lg border border-default p-3">
                <p class="text-xs text-muted">
                  Complained
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ eventsSummary?.complained ?? 0 }}
                </p>
              </div>
              <div class="rounded-lg border border-default p-3">
                <p class="text-xs text-muted">
                  Unsubscribed
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ eventsSummary?.unsubscribed ?? 0 }}
                </p>
              </div>
              <div class="rounded-lg border border-default p-3">
                <p class="text-xs text-muted">
                  Sent
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ eventsSummary?.sent ?? 0 }}
                </p>
              </div>
            </div>
          </section>

          <section class="space-y-3">
            <h4 class="text-sm font-semibold">
              Website Attribution
            </h4>
            <div class="grid gap-2 sm:grid-cols-5">
              <div class="rounded-lg border border-default p-3">
                <p class="text-xs text-muted">
                  Website events
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ attributionSummary?.website_events ?? 0 }}
                </p>
              </div>
              <div class="rounded-lg border border-default p-3">
                <p class="text-xs text-muted">
                  Sessions
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ attributionSummary?.sessions ?? 0 }}
                </p>
              </div>
              <div class="rounded-lg border border-default p-3">
                <p class="text-xs text-muted">
                  Page views
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ attributionSummary?.page_views ?? 0 }}
                </p>
              </div>
              <div class="rounded-lg border border-default p-3">
                <p class="text-xs text-muted">
                  Conversions
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ attributionSummary?.conversions ?? 0 }}
                </p>
              </div>
              <div class="rounded-lg border border-default p-3">
                <p class="text-xs text-muted">
                  Email-linked
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ attributionSummary?.click_attributed_events ?? 0 }}
                </p>
              </div>
              <div class="rounded-lg border border-default p-3">
                <p class="text-xs text-muted">
                  Leads
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ attributionSummary?.leads ?? 0 }}
                </p>
              </div>
            </div>
          </section>

          <section class="space-y-2">
            <h4 class="text-sm font-semibold">
              Event Stream
            </h4>
            <div v-if="!events.length" class="rounded-lg border border-default px-3 py-4 text-sm text-muted">
              No campaign events yet.
            </div>
            <div v-else class="divide-y divide-default rounded-lg border border-default">
              <div v-for="event in events" :key="event.id" class="flex items-center justify-between gap-3 px-3 py-2.5">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <UBadge :color="metricColor(event.event_type)" variant="subtle">
                      {{ event.event_type }}
                    </UBadge>
                    <UBadge v-if="event.suspected_scanner" color="warning" variant="subtle">
                      scanner
                    </UBadge>
                    <p class="truncate text-sm font-medium">
                      {{ event.subscriber_email ?? 'Unknown subscriber' }}
                    </p>
                  </div>
                  <p v-if="event.url" class="mt-1 truncate text-xs text-muted">
                    {{ event.url }}
                  </p>
                </div>
                <p class="shrink-0 text-xs text-muted">
                  {{ formatDate(event.occurred_at) }}
                </p>
              </div>
            </div>
          </section>

          <section class="space-y-2">
            <h4 class="text-sm font-semibold">
              Attributed Sessions
            </h4>
            <div v-if="!sessions.length" class="rounded-lg border border-default px-3 py-4 text-sm text-muted">
              No tracked website sessions yet.
            </div>
            <div v-else class="divide-y divide-default rounded-lg border border-default">
              <div
                v-for="session in sessions"
                :key="`${session.session_id || session.anon_id}`"
                class="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">
                    {{ session.session_id ?? session.anon_id }}
                  </p>
                  <p class="text-xs text-muted">
                    {{ session.events }} event(s) - {{ session.conversions }} conversion(s)
                  </p>
                  <p v-if="session.email_click_ids?.length" class="mt-1 truncate text-xs text-muted">
                    Clicks {{ session.email_click_ids.join(', ') }}
                  </p>
                </div>
                <p class="shrink-0 text-xs text-muted">
                  {{ formatDate(session.last_seen_at) }}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </template>
  </USlideover>
</template>
