<!-- app/components/email/CampaignPreflightPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue'

interface CampaignPreflightCheck {
  code: string
  label: string
  status: 'pass' | 'warning' | 'blocked'
  message: string
}

interface CampaignPreflightResult {
  ok: boolean
  blocked: boolean
  checkedAt?: string
  checks: CampaignPreflightCheck[]
}

interface RecipientSnapshot {
  listIds?: string[]
  dedupedRecipients?: number
  excludedUnsubscribed?: number
  excludedSuppressed?: number
  excludedBlocklisted?: number
  toSend?: number
  generatedAt?: string
}

const props = defineProps<{
  preflight?: CampaignPreflightResult | null
  recipientSnapshot?: RecipientSnapshot | null
  loading?: boolean
}>()

const activeChecks = computed(() =>
  (props.preflight?.checks ?? []).filter(check => check.status !== 'pass')
)

const status = computed(() => {
  if (!props.preflight) return { label: 'Not run', color: 'neutral' as const, icon: 'i-lucide-clock' }
  if (props.preflight.blocked) return { label: 'Blocked', color: 'error' as const, icon: 'i-lucide-shield-alert' }
  if (activeChecks.value.length) return { label: 'Warnings', color: 'warning' as const, icon: 'i-lucide-triangle-alert' }
  return { label: 'Ready', color: 'success' as const, icon: 'i-lucide-circle-check' }
})

function checkColor(check: CampaignPreflightCheck): 'error' | 'warning' | 'success' | 'neutral' {
  if (check.status === 'blocked') return 'error'
  if (check.status === 'warning') return 'warning'
  if (check.status === 'pass') return 'success'
  return 'neutral'
}

function formatDate(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<template>
  <section class="space-y-3 rounded-lg border border-default p-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h4 class="text-sm font-semibold">
          Preflight
        </h4>
        <p class="text-xs text-muted">
          <template v-if="preflight?.checkedAt">
            Checked {{ formatDate(preflight.checkedAt) }}
          </template>
          <template v-else>
            Preflight runs when this campaign is scheduled.
          </template>
        </p>
      </div>
      <UBadge :color="status.color" variant="subtle">
        <UIcon :name="status.icon" class="mr-1 size-3" />
        {{ status.label }}
      </UBadge>
    </div>

    <div v-if="loading" class="grid gap-2 sm:grid-cols-3">
      <USkeleton v-for="n in 3" :key="n" class="h-16 w-full" />
    </div>

    <div v-else class="grid gap-2 sm:grid-cols-5">
      <div class="rounded-md border border-default p-2">
        <p class="text-xs text-muted">
          Ready to send
        </p>
        <p class="mt-1 text-lg font-semibold tabular-nums">
          {{ recipientSnapshot?.toSend ?? 0 }}
        </p>
      </div>
      <div class="rounded-md border border-default p-2">
        <p class="text-xs text-muted">
          Selected lists
        </p>
        <p class="mt-1 text-lg font-semibold tabular-nums">
          {{ recipientSnapshot?.listIds?.length ?? 0 }}
        </p>
      </div>
      <div class="rounded-md border border-default p-2">
        <p class="text-xs text-muted">
          Deduped recipients
        </p>
        <p class="mt-1 text-lg font-semibold tabular-nums">
          {{ recipientSnapshot?.dedupedRecipients ?? recipientSnapshot?.toSend ?? 0 }}
        </p>
      </div>
      <div class="rounded-md border border-default p-2">
        <p class="text-xs text-muted">
          Unsubscribed
        </p>
        <p class="mt-1 text-lg font-semibold tabular-nums">
          {{ recipientSnapshot?.excludedUnsubscribed ?? 0 }}
        </p>
      </div>
      <div class="rounded-md border border-default p-2">
        <p class="text-xs text-muted">
          Suppressed
        </p>
        <p class="mt-1 text-lg font-semibold tabular-nums">
          {{ recipientSnapshot?.excludedSuppressed ?? 0 }}
        </p>
      </div>
    </div>

    <div class="grid gap-2 sm:grid-cols-2">
      <div class="rounded-md border border-default p-2">
        <p class="text-xs text-muted">
          Blocklisted
        </p>
        <p class="mt-1 text-lg font-semibold tabular-nums">
          {{ recipientSnapshot?.excludedBlocklisted ?? 0 }}
        </p>
      </div>
      <div class="rounded-md border border-default p-2">
        <p class="text-xs text-muted">
          Snapshot
        </p>
        <p class="mt-1 text-sm font-medium">
          {{ formatDate(recipientSnapshot?.generatedAt) || 'Pending' }}
        </p>
      </div>
    </div>

    <div v-if="activeChecks.length" class="divide-y divide-default rounded-md border border-default">
      <div v-for="check in activeChecks" :key="check.code" class="flex items-start justify-between gap-3 px-3 py-2.5">
        <div class="min-w-0">
          <p class="text-sm font-medium">
            {{ check.label }}
          </p>
          <p class="text-xs text-muted">
            {{ check.message }}
          </p>
        </div>
        <UBadge :color="checkColor(check)" variant="subtle">
          {{ check.status }}
        </UBadge>
      </div>
    </div>
  </section>
</template>
