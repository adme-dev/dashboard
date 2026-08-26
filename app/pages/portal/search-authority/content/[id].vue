<script setup lang="ts">
import { idempotencyKey } from '~~/app/utils/idempotencyKey'

definePageMeta({ layout: 'portal' })

interface ReviewResponse {
  asset: { id: string, title: string, topic: string, slug: string, status: string }
  version: {
    id: string
    versionNumber: number
    bodyMarkdown: string
    excerpt: string
    disclaimer: string
    schemaType: 'Article' | 'FAQPage'
    createdAt: string
  }
  sourceLabels: Array<{ name: string, role: string, occurredAt: string }>
  claims: Array<{ claim: string, sourceType: string, sourceReference: string, expiresAt: string | null }>
  canApprove: boolean
}

const route = useRoute()
const toast = useToast()
const decisionOpen = ref(false)
const decision = ref<'approved' | 'rejected'>('approved')
const rationale = ref('')
const saving = ref(false)
const { data, status, error, refresh } = await useFetch<ReviewResponse>(
  () => `/api/portal/search-authority/content/${route.params.id}`
)

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(new Date(value))
}

function openDecision(next: 'approved' | 'rejected') {
  decision.value = next
  rationale.value = ''
  decisionOpen.value = true
}

function closeDecision() {
  decisionOpen.value = false
}

async function saveDecision() {
  if (!data.value || rationale.value.trim().length < 5) return
  saving.value = true
  try {
    await $fetch(`/api/portal/search-authority/content/${data.value.asset.id}/decision`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey('search-authority-portal-decision') },
      body: {
        decision: decision.value,
        versionId: data.value.version.id,
        rationale: rationale.value.trim()
      }
    })
    decisionOpen.value = false
    toast.add({
      title: decision.value === 'approved' ? 'Guide approved' : 'Changes requested',
      description: 'Your decision is recorded against this exact version.',
      color: decision.value === 'approved' ? 'success' : 'warning'
    })
    await refresh()
  } catch (saveError: unknown) {
    const candidate = saveError as { data?: { statusMessage?: string } }
    toast.add({ title: 'Decision not saved', description: candidate?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
    <UButton
      to="/portal/search-authority"
      label="Back to Search Authority"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
    />

    <div v-if="status === 'pending'" class="space-y-4">
      <USkeleton class="h-28 w-full" />
      <USkeleton class="h-96 w-full" />
    </div>
    <UAlert
      v-else-if="error"
      title="Content review unavailable"
      description="This review may no longer be current or may not belong to your organisation."
      icon="i-lucide-triangle-alert"
      color="warning"
      variant="subtle"
    />
    <template v-else-if="data">
      <header class="border-b border-default pb-6">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-medium text-primary">Proposed guide</span>
          <UBadge :label="label(data.asset.status)" :color="data.asset.status === 'approved' ? 'success' : 'info'" variant="subtle" />
          <UBadge :label="`Version ${data.version.versionNumber}`" color="neutral" variant="outline" />
        </div>
        <h1 class="mt-3 text-3xl font-semibold tracking-tight text-highlighted">
          {{ data.asset.title }}
        </h1>
        <p class="mt-2 max-w-3xl text-base leading-7 text-muted">
          {{ data.version.excerpt }}
        </p>
      </header>

      <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div class="space-y-6">
          <UCard>
            <template #header>
              <div>
                <h2 class="font-semibold text-highlighted">
                  Guide copy
                </h2>
                <p class="mt-1 text-sm text-muted">
                  Read-only Markdown proposed for publication.
                </p>
              </div>
            </template>
            <div class="whitespace-pre-wrap text-sm leading-7 text-highlighted">
              {{ data.version.bodyMarkdown }}
            </div>
          </UCard>

          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Claims to verify
              </h2>
            </template>
            <ul class="divide-y divide-default">
              <li v-for="claim in data.claims" :key="`${claim.claim}:${claim.sourceReference}`" class="py-4 first:pt-0 last:pb-0">
                <p class="text-sm font-medium text-highlighted">
                  {{ claim.claim }}
                </p>
                <p class="mt-1 text-xs text-muted">
                  {{ label(claim.sourceType) }} · {{ claim.sourceReference }}
                </p>
              </li>
            </ul>
          </UCard>

          <UAlert
            title="Disclaimer"
            :description="data.version.disclaimer"
            icon="i-lucide-info"
            color="neutral"
            variant="subtle"
          />
        </div>

        <div class="space-y-6 lg:sticky lg:top-6">
          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Source labels
              </h2>
            </template>
            <ul class="space-y-4">
              <li v-for="source in data.sourceLabels" :key="`${source.name}:${source.occurredAt}`">
                <p class="text-sm font-medium text-highlighted">
                  {{ source.name }}
                </p>
                <p class="text-xs text-muted">
                  {{ source.role }} · {{ dateLabel(source.occurredAt) }}
                </p>
              </li>
            </ul>
          </UCard>

          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Decision
              </h2>
            </template>
            <p class="text-sm leading-6 text-muted">
              Approval applies only to version {{ data.version.versionNumber }}. Any later change requires a new review.
            </p>
            <div v-if="data.canApprove" class="mt-4 grid grid-cols-1 gap-2">
              <UButton
                label="Approve version"
                icon="i-lucide-circle-check"
                color="success"
                @click="openDecision('approved')"
              />
              <UButton
                label="Request changes"
                icon="i-lucide-message-square-warning"
                color="warning"
                variant="soft"
                @click="openDecision('rejected')"
              />
            </div>
            <UAlert
              v-else
              class="mt-4"
              title="Read-only review"
              description="You do not have approval permission, or this version has already been decided."
              color="neutral"
              variant="subtle"
            />
          </UCard>
        </div>
      </div>
    </template>

    <UModal v-model:open="decisionOpen" :title="decision === 'approved' ? 'Approve version' : 'Request changes'">
      <template #body>
        <UFormField label="Decision rationale" required>
          <UTextarea
            v-model="rationale"
            class="w-full"
            :rows="5"
            placeholder="Record your reason for this decision."
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="closeDecision"
          />
          <UButton
            :label="decision === 'approved' ? 'Approve version' : 'Request changes'"
            :color="decision === 'approved' ? 'success' : 'warning'"
            :loading="saving"
            :disabled="rationale.trim().length < 5"
            @click="saveDecision"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
