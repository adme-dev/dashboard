<script setup lang="ts">
import type { PortalSocialNewsAction, PortalSocialNewsDraft } from '~/types'

const props = defineProps<{
  draft: PortalSocialNewsDraft
  canApprove: boolean
  busy?: boolean
}>()

const emit = defineEmits<{
  decide: [draft: PortalSocialNewsDraft, action: PortalSocialNewsAction]
}>()

const activePlatform = ref(props.draft.platformPreviews[0]?.platform || '')
const activePreview = computed(() =>
  props.draft.platformPreviews.find(preview => preview.platform === activePlatform.value)
  || props.draft.platformPreviews[0]
)

watch(() => props.draft.id, () => {
  activePlatform.value = props.draft.platformPreviews[0]?.platform || ''
})

const statusColor = computed(() => ({
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  revision_requested: 'info'
}[props.draft.approval.status] || 'neutral'))

function label(value: string) {
  return value.replaceAll('-', ' ').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function selectPlatform(platform: string) {
  activePlatform.value = platform
}

function formatDateTime(value: string | null) {
  if (!value) return 'Not scheduled'
  const options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }
  try {
    return new Intl.DateTimeFormat('en-AU', { ...options, timeZone: props.draft.timezone }).format(new Date(value))
  } catch {
    return new Intl.DateTimeFormat('en-AU', options).format(new Date(value))
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-newspaper" class="size-4 text-primary" />
            <h3 class="font-semibold">
              {{ draft.source.title }}
            </h3>
          </div>
          <p class="mt-1 text-xs text-muted">
            Requested {{ formatDateTime(draft.approval.requestedAt) }}
          </p>
        </div>
        <UBadge :color="statusColor as any" variant="subtle">
          {{ label(draft.approval.status) }}
        </UBadge>
      </div>
    </template>

    <div class="grid gap-5 lg:grid-cols-[minmax(210px,0.65fr)_minmax(0,1.35fr)]">
      <aside class="space-y-4 border-b border-default pb-5 lg:border-r lg:border-b-0 lg:pr-5 lg:pb-0">
        <section>
          <div class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
            <span>Source attribution</span>
            <UTooltip v-if="draft.source.attributionLocked" text="Captured when the draft was created">
              <UIcon name="i-lucide-lock-keyhole" class="size-3.5" aria-label="Attribution locked" />
            </UTooltip>
          </div>
          <ULink
            v-if="draft.source.url"
            :to="draft.source.url"
            target="_blank"
            rel="noopener noreferrer"
            class="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary"
          >
            Read original source
            <UIcon name="i-lucide-external-link" class="size-3.5" />
          </ULink>
          <p v-if="draft.source.author" class="mt-1 text-xs text-muted">
            {{ draft.source.author }}
          </p>
        </section>

        <section>
          <p class="text-xs font-medium uppercase tracking-wide text-muted">
            Target accounts
          </p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <UBadge
              v-for="account in draft.targetAccounts"
              :key="account.id"
              color="neutral"
              variant="subtle"
            >
              {{ label(account.platform) }} · {{ account.name }}
            </UBadge>
            <span v-if="!draft.targetAccounts.length" class="text-xs text-warning">No target account linked</span>
          </div>
        </section>

        <section class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <p class="text-xs text-muted">
              Scheduled
            </p>
            <p class="mt-0.5 font-medium">
              {{ formatDateTime(draft.scheduledAt) }}
            </p>
          </div>
          <div>
            <p class="text-xs text-muted">
              Decision due
            </p>
            <p class="mt-0.5 font-medium">
              {{ formatDateTime(draft.approval.dueAt) }}
            </p>
          </div>
        </section>

        <section v-if="draft.package" class="rounded-lg border border-default p-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="text-sm font-medium">
                {{ draft.package.name }}
              </p>
              <p class="text-xs text-muted">
                Package v{{ draft.package.version }}
              </p>
            </div>
            <UBadge color="neutral" variant="outline" size="xs">
              {{ draft.package.approvalSlaHours ?? '—' }}h SLA
            </UBadge>
          </div>
          <dl class="mt-3 space-y-1.5 text-xs">
            <div v-for="(limit, platform) in draft.package.includedPostVolumes" :key="platform" class="flex justify-between gap-3">
              <dt class="text-muted">
                {{ label(String(platform)) }}
              </dt>
              <dd>{{ draft.package.usageByPlatform[String(platform)] || 0 }} / {{ limit }}</dd>
            </div>
          </dl>
          <p class="mt-2 text-xs text-muted">
            Overage: {{ label(draft.package.overagePolicy) }}
          </p>
        </section>
        <p v-else class="rounded-lg border border-dashed border-default p-3 text-xs text-muted">
          No social package is linked to this draft.
        </p>
        <UAlert
          v-if="draft.package?.warnings.length"
          color="warning"
          variant="subtle"
          title="Package usage warning"
          :description="draft.package.warnings.join(' · ')"
        />
      </aside>

      <div class="min-w-0 space-y-4">
        <section>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-xs font-medium uppercase tracking-wide text-muted">
              Platform preview
            </p>
            <div class="flex flex-wrap gap-1" aria-label="Choose preview platform">
              <UButton
                v-for="preview in draft.platformPreviews"
                :key="preview.platform"
                size="xs"
                :color="activePlatform === preview.platform ? 'primary' : 'neutral'"
                :variant="activePlatform === preview.platform ? 'subtle' : 'ghost'"
                @click="selectPlatform(preview.platform)"
              >
                {{ label(preview.platform) }}
              </UButton>
            </div>
          </div>
          <div class="mt-3 rounded-lg border border-default bg-elevated p-4">
            <div v-if="activePreview?.isAiRewrite" class="mb-3 flex items-center gap-1.5 text-xs text-muted">
              <UIcon name="i-lucide-sparkles" class="size-3.5" />
              AI-assisted rewrite
            </div>
            <p class="whitespace-pre-wrap text-sm leading-6">
              {{ activePreview?.content }}
            </p>
            <div v-if="activePreview?.mediaUrls.length" class="mt-4 grid grid-cols-2 gap-2">
              <img
                v-for="url in activePreview.mediaUrls"
                :key="url"
                :src="url"
                alt=""
                class="aspect-video w-full rounded-md border border-default object-cover"
                loading="lazy"
              >
            </div>
          </div>
        </section>

        <section v-if="draft.approval.feedback" class="rounded-lg border border-default p-3">
          <p class="text-xs font-medium uppercase tracking-wide text-muted">
            Latest feedback
          </p>
          <p class="mt-2 whitespace-pre-wrap text-sm">
            {{ draft.approval.feedback }}
          </p>
        </section>

        <details v-if="draft.audit.length" class="text-sm">
          <summary class="cursor-pointer font-medium">
            Approval history ({{ draft.audit.length }})
          </summary>
          <ol class="mt-3 space-y-2 border-l border-default pl-4">
            <li v-for="event in draft.audit" :key="`${event.action}-${event.createdAt}`">
              <p>{{ label(event.action) }}</p>
              <p class="text-xs text-muted">
                {{ event.actorType === 'client' ? 'Client portal' : 'Agency' }} · {{ formatDateTime(event.createdAt) }}
              </p>
            </li>
          </ol>
        </details>

        <div v-if="draft.approval.status === 'pending' && canApprove" class="flex flex-wrap gap-2 border-t border-default pt-4">
          <UButton
            color="success"
            icon="i-lucide-check"
            :loading="busy"
            @click="emit('decide', draft, 'approve')"
          >
            Approve
          </UButton>
          <UButton
            color="warning"
            variant="soft"
            icon="i-lucide-message-square"
            :disabled="busy"
            @click="emit('decide', draft, 'request_changes')"
          >
            Request changes
          </UButton>
          <UButton
            color="error"
            variant="soft"
            icon="i-lucide-x"
            :disabled="busy"
            @click="emit('decide', draft, 'reject')"
          >
            Reject
          </UButton>
        </div>
        <UAlert
          v-else-if="draft.approval.status === 'pending'"
          color="neutral"
          variant="subtle"
          title="View only"
          description="Your portal access does not include approval decisions."
        />
      </div>
    </div>
  </UCard>
</template>
