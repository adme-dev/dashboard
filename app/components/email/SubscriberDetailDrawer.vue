<!-- app/components/email/SubscriberDetailDrawer.vue -->
<script setup lang="ts">
import { describeEmailActionError } from '~~/app/utils/emailActionError'

interface SubscriberHistory {
  subscriber: {
    id: string
    email: string
    name: string | null
    status: string
    soft_bounce_count?: number
    last_soft_bounce_at?: string | null
    created_at: string
    updated_at: string
  }
  current_suppression?: {
    email: string
    reason: string
    campaign_id?: string | null
    created_at?: string | null
    updated_at?: string | null
  } | null
  lists: Array<{
    list_id: string
    list_name: string
    status: string
    source: string
    subscribed_at?: string | null
    unsubscribed_at?: string | null
  }>
  consent_events: Array<Record<string, unknown>>
  suppression_events: Array<Record<string, unknown>>
  campaign_events: Array<Record<string, unknown>>
}

const props = defineProps<{ subscriberId: string | null }>()
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const pending = ref(false)
const history = ref<SubscriberHistory | null>(null)

function formatDate(value: unknown): string {
  if (!value || typeof value !== 'string') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function eventLabel(event: Record<string, unknown>): string {
  return String(event.event_type ?? event.action ?? event.reason ?? 'event').replace(/_/g, ' ')
}

function badgeColor(value: unknown): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  if (value === 'confirmed' || value === 'enabled' || value === 'delivered') return 'success'
  if (value === 'unconfirmed' || value === 'soft_bounce' || value === 'delivery_delayed' || value === 'global_unsubscribe') return 'warning'
  if (value === 'unsubscribed' || value === 'complaint' || value === 'hard_bounce') return 'error'
  if (value === 'manual' || value === 'clicked' || value === 'opened') return 'info'
  return 'neutral'
}

function metadataNote(event: Record<string, unknown>): string {
  const metadata = event.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return ''
  const note = (metadata as Record<string, unknown>).note
  return typeof note === 'string' ? note.trim() : ''
}

async function load() {
  if (!open.value || !props.subscriberId) return
  pending.value = true
  try {
    history.value = await $fetch<SubscriberHistory>(`/api/email/subscribers/${props.subscriberId}/history`)
  } catch (e) {
    history.value = null
    toast.add({
      title: 'Subscriber history failed',
      description: describeEmailActionError(e, 'Could not load subscriber history.'),
      color: 'error'
    })
  } finally {
    pending.value = false
  }
}

watch([open, () => props.subscriberId], load, { immediate: true })
</script>

<template>
  <USlideover :open="open" :ui="{ content: 'max-w-3xl' }" @update:open="open = $event">
    <template #content>
      <div class="flex h-full flex-col">
        <div class="flex items-start justify-between gap-4 border-b border-default p-5">
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase text-muted">
              Subscriber history
            </p>
            <h3 class="mt-1 truncate text-lg font-semibold">
              {{ history?.subscriber.email ?? 'Subscriber' }}
            </h3>
            <p v-if="history?.subscriber.name" class="text-sm text-muted">
              {{ history.subscriber.name }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UBadge v-if="history?.subscriber.status" :color="badgeColor(history.subscriber.status)" variant="subtle">
              {{ history.subscriber.status }}
            </UBadge>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="open = false"
            />
          </div>
        </div>

        <div v-if="pending" class="space-y-3 p-5">
          <USkeleton class="h-5 w-2/3" />
          <USkeleton class="h-32 w-full" />
          <USkeleton class="h-32 w-full" />
        </div>

        <div v-else-if="history" class="flex-1 overflow-auto p-5 space-y-6">
          <section class="grid gap-3 sm:grid-cols-4">
            <div class="rounded-lg border border-default p-3">
              <p class="text-xs text-muted">
                Soft bounces
              </p>
              <p class="mt-1 text-lg font-semibold">
                {{ history.subscriber.soft_bounce_count ?? 0 }}
              </p>
              <p v-if="history.subscriber.last_soft_bounce_at" class="text-xs text-muted">
                Last {{ formatDate(history.subscriber.last_soft_bounce_at) }}
              </p>
            </div>
            <div class="rounded-lg border border-default p-3">
              <p class="text-xs text-muted">
                Current suppression
              </p>
              <div class="mt-1">
                <UBadge
                  v-if="history.current_suppression"
                  :color="badgeColor(history.current_suppression.reason)"
                  variant="subtle"
                >
                  {{ String(history.current_suppression.reason).replace(/_/g, ' ') }}
                </UBadge>
                <p v-else class="text-sm font-medium">
                  None
                </p>
              </div>
              <p v-if="history.current_suppression?.updated_at" class="mt-1 text-xs text-muted">
                Updated {{ formatDate(history.current_suppression.updated_at) }}
              </p>
            </div>
            <div class="rounded-lg border border-default p-3">
              <p class="text-xs text-muted">
                Created
              </p>
              <p class="mt-1 text-sm font-medium">
                {{ formatDate(history.subscriber.created_at) }}
              </p>
            </div>
            <div class="rounded-lg border border-default p-3">
              <p class="text-xs text-muted">
                Updated
              </p>
              <p class="mt-1 text-sm font-medium">
                {{ formatDate(history.subscriber.updated_at) }}
              </p>
            </div>
          </section>

          <section class="space-y-2">
            <h4 class="text-sm font-semibold">
              List Memberships
            </h4>
            <div v-if="!history.lists.length" class="rounded-lg border border-default px-3 py-4 text-sm text-muted">
              No list memberships.
            </div>
            <div v-else class="divide-y divide-default rounded-lg border border-default">
              <div v-for="item in history.lists" :key="item.list_id" class="flex items-center justify-between gap-3 px-3 py-2.5">
                <div>
                  <p class="text-sm font-medium">
                    {{ item.list_name }}
                  </p>
                  <p class="text-xs text-muted">
                    {{ item.source }}<span v-if="item.subscribed_at"> · {{ formatDate(item.subscribed_at) }}</span>
                  </p>
                </div>
                <UBadge :color="badgeColor(item.status)" variant="subtle">
                  {{ item.status }}
                </UBadge>
              </div>
            </div>
          </section>

          <section class="space-y-2">
            <h4 class="text-sm font-semibold">
              Consent History
            </h4>
            <div v-if="!history.consent_events.length" class="rounded-lg border border-default px-3 py-4 text-sm text-muted">
              No consent events.
            </div>
            <div v-else class="divide-y divide-default rounded-lg border border-default">
              <div v-for="(event, index) in history.consent_events" :key="String(event.id ?? index)" class="px-3 py-2.5">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm font-medium capitalize">
                    {{ eventLabel(event) }}
                  </p>
                  <UBadge :color="badgeColor(event.source)" variant="subtle">
                    {{ event.source }}
                  </UBadge>
                </div>
                <p class="text-xs text-muted">
                  {{ formatDate(event.occurred_at) }}
                </p>
                <p v-if="metadataNote(event)" class="mt-1 text-xs text-muted">
                  {{ metadataNote(event) }}
                </p>
              </div>
            </div>
          </section>

          <section class="space-y-2">
            <h4 class="text-sm font-semibold">
              Suppression History
            </h4>
            <div v-if="!history.suppression_events.length" class="rounded-lg border border-default px-3 py-4 text-sm text-muted">
              No suppression events.
            </div>
            <div v-else class="divide-y divide-default rounded-lg border border-default">
              <div v-for="(event, index) in history.suppression_events" :key="String(event.id ?? index)" class="px-3 py-2.5">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <p class="text-sm font-medium capitalize">
                    {{ event.action }} {{ event.reason }}
                  </p>
                  <UBadge :color="badgeColor(event.reason)" variant="subtle">
                    {{ event.source }}
                  </UBadge>
                </div>
                <p class="text-xs text-muted">
                  {{ formatDate(event.occurred_at) }}
                </p>
                <p v-if="metadataNote(event)" class="mt-1 text-xs text-muted">
                  {{ metadataNote(event) }}
                </p>
              </div>
            </div>
          </section>

          <section class="space-y-2">
            <h4 class="text-sm font-semibold">
              Campaign Events
            </h4>
            <div v-if="!history.campaign_events.length" class="rounded-lg border border-default px-3 py-4 text-sm text-muted">
              No campaign events.
            </div>
            <div v-else class="divide-y divide-default rounded-lg border border-default">
              <div v-for="(event, index) in history.campaign_events" :key="String(event.id ?? index)" class="px-3 py-2.5">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium capitalize">
                      {{ eventLabel(event) }}
                    </p>
                    <p class="truncate text-xs text-muted">
                      {{ event.campaign_name ?? event.campaign_id ?? 'Unknown campaign' }}
                    </p>
                  </div>
                  <p class="shrink-0 text-xs text-muted">
                    {{ formatDate(event.occurred_at) }}
                  </p>
                </div>
                <p v-if="event.url" class="mt-1 truncate text-xs text-muted">
                  {{ event.url }}
                </p>
              </div>
            </div>
          </section>
        </div>

        <div v-else class="p-5 text-sm text-muted">
          No history loaded.
        </div>
      </div>
    </template>
  </USlideover>
</template>
