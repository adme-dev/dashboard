<script setup lang="ts">
// F10 — unified communication + activity timeline for a record. Channel-filterable,
// with an inline "log communication" form. Works on agency + portal via crmApiBase.
import { formatDistanceToNow } from 'date-fns'

const props = defineProps<{ clientId: string, targetType: 'person' | 'company', targetId: string }>()
const base = inject<string>('crmApiBase', '/api/crm')
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown, query?: Record<string, unknown> }
) => Promise<T>

interface Entry {
  source: 'activity' | 'communication'
  id: string
  kind: string
  direction: 'inbound' | 'outbound' | null
  title: string | null
  body: string | null
  at: string
  actor_name: string | null
}

type FetchFailure = {
  data?: { statusMessage?: string }
  message?: string
}

const channel = ref<string>('all')
const query = computed(() => {
  const q: Record<string, string> = { client_id: props.clientId, target: props.targetType, target_id: props.targetId }
  if (channel.value !== 'all') q.channel = channel.value
  return q
})
const data = ref<{ items: Entry[] }>({ items: [] })
const pending = ref(false)

async function refresh() {
  pending.value = true
  try {
    data.value = await apiFetch<{ items: Entry[] }>(`${base}/communications`, { query: query.value })
  } finally {
    pending.value = false
  }
}

watch(query, () => {
  refresh()
}, { immediate: true })

const CHANNEL_META: Record<string, { icon: string, label: string }> = {
  email: { icon: 'i-lucide-mail', label: 'Email' },
  call: { icon: 'i-lucide-phone', label: 'Call' },
  sms: { icon: 'i-lucide-message-square', label: 'SMS' },
  meeting: { icon: 'i-lucide-users', label: 'Meeting' },
  note: { icon: 'i-lucide-sticky-note', label: 'Note' }
}
function entryIcon(e: Entry) {
  if (e.source === 'communication') return CHANNEL_META[e.kind]?.icon ?? 'i-lucide-message-circle'
  return 'i-lucide-activity'
}
function rel(at: string) {
  try {
    return formatDistanceToNow(new Date(at), { addSuffix: true })
  } catch {
    return ''
  }
}

const channelOptions = [
  { label: 'All', value: 'all' },
  ...Object.entries(CHANNEL_META).map(([value, m]) => ({ label: m.label, value }))
]

// Log form
const logging = ref(false)
const form = reactive({ channel: 'note', direction: 'outbound' as 'inbound' | 'outbound', subject: '', body: '' })
const directionOptions = [{ label: 'Outbound', value: 'outbound' }, { label: 'Inbound', value: 'inbound' }]
const showDirection = computed(() => form.channel === 'email' || form.channel === 'call' || form.channel === 'sms')

async function log() {
  if (!form.subject.trim() && !form.body.trim()) return
  logging.value = true
  try {
    await apiFetch(`${base}/communications`, {
      method: 'POST',
      body: {
        client_id: props.clientId,
        [props.targetType === 'person' ? 'person_id' : 'company_id']: props.targetId,
        channel: form.channel,
        direction: showDirection.value ? form.direction : null,
        subject: form.subject.trim() || null,
        body: form.body.trim() || null
      }
    })
    form.subject = ''
    form.body = ''
    await refresh()
    toast.add({ title: 'Logged', color: 'success' })
  } catch (error: unknown) {
    const failure = error as FetchFailure
    toast.add({
      title: 'Could not log',
      description: failure.data?.statusMessage || failure.message,
      color: 'error'
    })
  } finally {
    logging.value = false
  }
}

async function remove(e: Entry) {
  if (e.source !== 'communication') return
  try {
    await apiFetch(`${base}/communications/${e.id}`, { method: 'DELETE', query: { client_id: props.clientId } })
    await refresh()
  } catch (error: unknown) {
    const failure = error as FetchFailure
    toast.add({
      title: 'Could not delete',
      description: failure.data?.statusMessage || failure.message,
      color: 'error'
    })
  }
}
</script>

<template>
  <div class="space-y-3">
    <!-- Log form -->
    <form
      class="@container space-y-4 rounded-lg border border-default p-4"
      @submit.prevent="log"
    >
      <div class="grid grid-cols-1 gap-4 @md:grid-cols-2">
        <UFormField
          label="Activity type"
          :class="{ '@md:col-span-2': !showDirection }"
        >
          <USelect
            v-model="form.channel"
            class="w-full"
            :items="channelOptions.slice(1)"
            value-key="value"
            size="sm"
          />
        </UFormField>
        <UFormField v-if="showDirection" label="Direction">
          <USelect
            v-model="form.direction"
            class="w-full"
            :items="directionOptions"
            value-key="value"
            size="sm"
          />
        </UFormField>
      </div>

      <UFormField label="Subject" hint="Optional">
        <UInput
          v-model="form.subject"
          class="w-full"
          placeholder="Add a short summary"
          size="sm"
        />
      </UFormField>

      <UFormField label="Details">
        <UTextarea
          v-model="form.body"
          class="w-full"
          :rows="4"
          placeholder="What happened?"
          size="sm"
        />
      </UFormField>

      <div class="flex justify-end">
        <UButton
          type="submit"
          size="sm"
          icon="i-lucide-plus"
          :loading="logging"
          :disabled="!form.subject.trim() && !form.body.trim()"
        >
          Log {{ form.channel }}
        </UButton>
      </div>
    </form>

    <!-- Channel filter -->
    <div class="flex items-center gap-2">
      <USelect
        v-model="channel"
        :items="channelOptions"
        value-key="value"
        size="sm"
        class="w-36"
      />
      <span class="text-xs text-muted">{{ data?.items?.length || 0 }} entries</span>
    </div>

    <!-- Timeline -->
    <div v-if="pending" class="text-sm text-muted py-4 text-center">
      Loading…
    </div>
    <div v-else-if="!data?.items?.length" class="text-sm text-muted py-6 text-center">
      No communications or activity yet.
    </div>
    <ul v-else class="space-y-2.5">
      <li v-for="e in data.items" :key="e.source + e.id" class="flex gap-2.5 group">
        <div class="mt-0.5 size-7 shrink-0 rounded-full bg-elevated flex items-center justify-center">
          <UIcon :name="entryIcon(e)" class="size-3.5 text-muted" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-sm font-medium">{{ e.title || CHANNEL_META[e.kind]?.label || e.kind }}</span>
            <UBadge
              v-if="e.direction"
              size="sm"
              variant="soft"
              :color="e.direction === 'inbound' ? 'info' : 'neutral'"
            >
              {{ e.direction }}
            </UBadge>
            <UBadge
              v-if="e.source === 'communication'"
              size="sm"
              variant="outline"
              color="neutral"
            >
              {{ e.kind }}
            </UBadge>
          </div>
          <p v-if="e.body" class="text-sm text-muted whitespace-pre-wrap mt-0.5">
            {{ e.body }}
          </p>
          <p class="text-xs text-muted mt-0.5">
            {{ e.actor_name || 'System' }} · {{ rel(e.at) }}
          </p>
        </div>
        <UButton
          v-if="e.source === 'communication'"
          icon="i-lucide-trash-2"
          variant="ghost"
          color="neutral"
          size="xs"
          class="opacity-0 group-hover:opacity-100"
          @click="remove(e)"
        />
      </li>
    </ul>
  </div>
</template>
