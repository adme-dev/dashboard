<!-- app/components/email/SuppressionPanel.vue -->
<script setup lang="ts">
import { describeEmailActionError } from '~~/app/utils/emailActionError'

interface SuppressionRow {
  email: string
  reason: 'hard_bounce' | 'complaint' | 'manual' | 'global_unsubscribe' | 'soft_bounce'
  campaign_id?: string | null
  created_at?: string | null
  updated_at?: string | null
  subscriber_id?: string | null
  subscriber_name?: string | null
  subscriber_status?: string | null
}

type SuppressionWriteAction = 'added' | 'ignored' | 'updated'

const toast = useToast()
const search = ref('')
const reason = ref<'all' | SuppressionRow['reason']>('all')
const page = ref(1)
const pageSize = 50

const reasonOptions = [
  { value: 'all', label: 'All reasons' },
  { value: 'manual', label: 'Manual' },
  { value: 'global_unsubscribe', label: 'Global unsubscribe' },
  { value: 'soft_bounce', label: 'Soft bounce' },
  { value: 'hard_bounce', label: 'Hard bounce' },
  { value: 'complaint', label: 'Complaint' }
]

const query = computed(() => ({
  q: search.value || undefined,
  reason: reason.value === 'all' ? undefined : reason.value,
  page: page.value,
  page_size: pageSize
}))

const { data, refresh, pending } = await useFetch<{
  items: SuppressionRow[]
  total: number
  page: number
  page_size: number
}>('/api/email/suppressions', {
  query,
  default: () => ({ items: [], total: 0, page: 1, page_size: pageSize })
})

const form = reactive({ email: '', note: '' })
const saving = ref(false)
const removing = ref<string | null>(null)

const hasNext = computed(() => (data.value?.total ?? 0) > page.value * pageSize)
const hasPrev = computed(() => page.value > 1)

watch([search, reason], () => {
  page.value = 1
})

function formatDate(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function reasonColor(value: SuppressionRow['reason']): 'error' | 'warning' | 'info' | 'neutral' {
  if (value === 'complaint' || value === 'hard_bounce') return 'error'
  if (value === 'global_unsubscribe' || value === 'soft_bounce') return 'warning'
  if (value === 'manual') return 'info'
  return 'neutral'
}

function suppressionToast(action: SuppressionWriteAction): { title: string, color: 'success' | 'warning' } {
  if (action === 'added') return { title: 'Email suppressed', color: 'success' }
  if (action === 'updated') return { title: 'Suppression updated', color: 'success' }
  return { title: 'Suppression already exists', color: 'warning' }
}

async function addSuppression() {
  if (!form.email.trim()) {
    toast.add({ title: 'Email required', color: 'error' })
    return
  }
  const note = form.note.trim()
  if (!note) {
    toast.add({ title: 'Suppression reason required', color: 'error' })
    return
  }
  saving.value = true
  try {
    const result = await $fetch<{ action: SuppressionWriteAction, email: string }>('/api/email/suppressions', {
      method: 'POST',
      body: {
        email: form.email,
        note
      }
    })
    const toastDetails = suppressionToast(result.action)
    toast.add({
      title: toastDetails.title,
      description: result.email,
      color: toastDetails.color
    })
    form.email = ''
    form.note = ''
    refresh()
  } catch (e) {
    toast.add({
      title: 'Suppress failed',
      description: describeEmailActionError(e, 'Could not suppress email.'),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function removeSuppression(row: SuppressionRow) {
  const requiresConfirmation = row.reason === 'hard_bounce' || row.reason === 'complaint'
  const confirmed = requiresConfirmation
    ? window.confirm(`Remove ${row.reason.replace(/_/g, ' ')} suppression for ${row.email}?`)
    : false
  if (requiresConfirmation && !confirmed) return
  const note = window.prompt(
    `Reason for removing suppression for ${row.email}`,
    requiresConfirmation ? 'Confirmed admin removal' : ''
  )
  if (note === null) return
  const trimmedNote = note.trim()
  if (!trimmedNote) {
    toast.add({ title: 'Removal reason required', color: 'error' })
    return
  }

  removing.value = row.email
  try {
    await $fetch(`/api/email/suppressions/${encodeURIComponent(row.email)}`, {
      method: 'DELETE',
      body: {
        confirm: confirmed,
        note: trimmedNote
      }
    })
    toast.add({ title: 'Suppression removed', description: row.email, color: 'success' })
    refresh()
  } catch (e) {
    toast.add({
      title: 'Remove failed',
      description: describeEmailActionError(e, 'Could not remove suppression.'),
      color: 'error'
    })
  } finally {
    removing.value = null
  }
}
</script>

<template>
  <div class="space-y-5">
    <section class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_28rem]">
      <div class="flex flex-wrap items-center gap-2">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search email or subscriber"
          class="w-72 max-w-full"
        />
        <USelectMenu
          v-model="reason"
          :items="reasonOptions"
          value-key="value"
          class="w-52"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          :loading="pending"
          aria-label="Refresh suppressions"
          @click="refresh()"
        />
      </div>

      <div class="rounded-lg border border-default p-3">
        <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <UInput
            v-model="form.email"
            type="email"
            icon="i-lucide-mail"
            placeholder="person@example.com"
            class="w-full"
          />
          <UButton
            icon="i-lucide-shield-ban"
            label="Suppress"
            :loading="saving"
            @click="addSuppression"
          />
        </div>
        <UTextarea
          v-model="form.note"
          :rows="2"
          placeholder="Reason or internal note"
          class="mt-2 w-full"
        />
      </div>
    </section>

    <div v-if="pending" class="text-sm text-muted">
      Loading...
    </div>
    <div v-else-if="!data?.items?.length" class="py-8 text-center text-sm text-muted">
      No suppressions found.
    </div>

    <div v-else class="divide-y divide-default rounded-lg border border-default">
      <div v-for="row in data.items" :key="row.email" class="flex items-center justify-between gap-4 px-4 py-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <p class="truncate font-medium">
              {{ row.email }}
            </p>
            <UBadge :color="reasonColor(row.reason)" variant="subtle">
              {{ row.reason.replace(/_/g, ' ') }}
            </UBadge>
            <UBadge v-if="row.subscriber_status" color="neutral" variant="subtle">
              {{ row.subscriber_status }}
            </UBadge>
          </div>
          <p class="text-sm text-muted">
            <span v-if="row.subscriber_name">{{ row.subscriber_name }} · </span>
            <span>{{ formatDate(row.created_at) }}</span>
          </p>
        </div>

        <UButton
          icon="i-lucide-shield-x"
          label="Remove"
          color="neutral"
          variant="outline"
          size="sm"
          :loading="removing === row.email"
          @click="removeSuppression(row)"
        />
      </div>
    </div>

    <div v-if="data?.total" class="flex items-center justify-between gap-3 text-xs text-muted">
      <p>{{ data.total }} total</p>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="!hasPrev"
          aria-label="Previous page"
          @click="page--"
        />
        <span>Page {{ page }}</span>
        <UButton
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="!hasNext"
          aria-label="Next page"
          @click="page++"
        />
      </div>
    </div>
  </div>
</template>
