<!-- app/components/email/CampaignPreflightPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import type { EmailDiagnosticReference } from '../../../shared/emailRendering/contentDiagnostics'

interface CampaignPreflightCheck {
  code: string
  label?: string
  status: 'pass' | 'warning' | 'blocked'
  message: string
  id?: string
  reference?: EmailDiagnosticReference
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
  excludedDisabled?: number
  toSend?: number
  generatedAt?: string
}

const props = defineProps<{
  preflight?: CampaignPreflightResult | null
  recipientSnapshot?: RecipientSnapshot | null
  loading?: boolean
  /** Content-only mode is also used for current, unsaved builder diagnostics. */
  contentOnly?: boolean
  canSelectIssue?: boolean
}>()

const emit = defineEmits<{ 'select-issue': [reference: EmailDiagnosticReference] }>()

const activeChecks = computed(() =>
  (props.preflight?.checks ?? []).filter(check => check.status !== 'pass')
)
const checkGroups = computed(() => [
  { label: 'Resolve before sending', checks: activeChecks.value.filter(check => check.status === 'blocked') },
  { label: 'Review warnings', checks: activeChecks.value.filter(check => check.status === 'warning') }
].filter(group => group.checks.length))

const status = computed(() => {
  if (!props.preflight) return { label: 'Not run', color: 'neutral' as const, icon: 'i-lucide-clock' }
  if (props.preflight.blocked) return { label: 'Blocked', color: 'error' as const, icon: 'i-lucide-shield-alert' }
  if (activeChecks.value.length) return { label: 'Warnings', color: 'warning' as const, icon: 'i-lucide-triangle-alert' }
  return { label: props.contentOnly ? 'No warnings' : 'Ready', color: 'success' as const, icon: 'i-lucide-circle-check' }
})

function checkColor(check: CampaignPreflightCheck): 'error' | 'warning' | 'success' | 'neutral' {
  if (check.status === 'blocked') return 'error'
  if (check.status === 'warning') return 'warning'
  if (check.status === 'pass') return 'success'
  return 'neutral'
}

const CHECK_LABELS: Record<string, string> = {
  unsubscribe: 'Unsubscribe',
  sender: 'Sender',
  auth_readiness: 'Authentication readiness',
  media_urls: 'Media URLs',
  html_size: 'HTML size',
  footer_identity: 'Footer identity',
  recipients: 'Recipients'
}

function checkLabel(check: CampaignPreflightCheck): string {
  return check.label || CHECK_LABELS[check.code] || check.code.replace(/_/g, ' ')
}

function formatDate(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<template>
  <section class="@container min-h-0 space-y-3 rounded-lg border border-default p-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h4 class="text-sm font-semibold">
          {{ contentOnly ? 'Content checks' : 'Preflight' }}
        </h4>
        <p class="text-xs text-muted">
          <template v-if="contentOnly">
            Current edits · Advisory checks
          </template>
          <template v-else-if="preflight?.checkedAt">
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

    <p class="text-xs text-muted">
      Automated checks do not certify email-client rendering. Contrast is checked only for known solid colours; image weight uses stored metadata only.
    </p>

    <div v-if="loading" class="grid gap-2 @lg:grid-cols-3">
      <USkeleton v-for="n in 3" :key="n" class="h-16 w-full" />
    </div>

    <div v-else-if="!contentOnly" class="grid gap-2 @lg:grid-cols-5">
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

    <div v-if="!contentOnly" class="grid gap-2 @lg:grid-cols-3">
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
          Disabled
        </p>
        <p class="mt-1 text-lg font-semibold tabular-nums">
          {{ recipientSnapshot?.excludedDisabled ?? 0 }}
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

    <div
      v-if="activeChecks.length"
      class="max-h-80 min-h-0 space-y-3 overflow-y-auto"
      aria-label="Preflight issues"
      tabindex="0"
    >
      <div v-for="group in checkGroups" :key="group.label">
        <h5 class="mb-2 text-sm font-semibold">
          {{ group.label }}
        </h5>
        <div class="divide-y divide-default rounded-md border border-default">
          <div v-for="(check, index) in group.checks" :key="check.id || `${check.code}:${index}`" class="flex items-start justify-between gap-3 px-3 py-2.5">
            <div class="min-w-0 space-y-1">
              <p class="text-sm font-medium">
                {{ checkLabel(check) }}
              </p>
              <p class="text-xs text-muted">
                {{ check.message }}
              </p>
              <UButton
                v-if="canSelectIssue && check.reference"
                color="neutral"
                variant="link"
                size="xs"
                icon="i-lucide-focus"
                :label="check.reference.field && !check.reference.blockId ? 'Review email settings' : 'Show in editor'"
                :aria-label="`Review ${checkLabel(check).toLowerCase()} in editor`"
                @click="emit('select-issue', check.reference)"
              />
            </div>
            <UBadge :color="checkColor(check)" variant="subtle">
              {{ check.status }}
            </UBadge>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
