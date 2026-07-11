<script setup lang="ts">
import { FORMATS } from '~/utils/banner-constants'

const props = defineProps<{ projectId: string }>()
const open = defineModel<boolean>('open', { default: false })

const {
  step,
  canProceedStep1,
  canProceedStep2,
  canProceedStep3,
  canProceedStep4,
  isUploading,
  uploadComplete,
  adPublishes,
  fetchAdPublishes,
  syncStatuses,
  isSyncingStatuses,
  nextStep,
  prevStep,
  reset,
} = useMetaAdUpload()

const toast = useToast()

async function refreshStatuses() {
  try {
    const res = await syncStatuses(props.projectId)
    if (res?.ok) {
      toast.add({
        title: 'Statuses refreshed',
        description: res.updated ? `${res.updated} ad${res.updated === 1 ? '' : 's'} updated.` : 'No changes since last check.',
        color: 'success',
      })
    }
  } catch (err: any) {
    toast.add({ title: 'Refresh failed', description: err?.data?.statusMessage || err.message || 'Unknown error', color: 'error' })
  }
}

const STEPS = [
  { num: 1, label: 'Account' },
  { num: 2, label: 'Campaign' },
  { num: 3, label: 'Creatives' },
  { num: 4, label: 'Ad Copy' },
  { num: 5, label: 'Publish' },
]

const canNext = computed(() => {
  switch (step.value) {
    case 1: return canProceedStep1.value
    case 2: return canProceedStep2.value
    case 3: return canProceedStep3.value
    case 4: return canProceedStep4.value
    default: return false
  }
})

// Fetch ad publish history on mount
onMounted(() => {
  fetchAdPublishes(props.projectId)
})

// Reset state when closing
watch(open, (val) => {
  if (!val) {
    // Delay reset so the slide-out animation completes
    setTimeout(() => reset(), 300)
  }
})

function handleClose() {
  open.value = false
}

function statusColor(s: string): 'success' | 'error' | 'warning' | 'neutral' {
  if (s === 'active' || s === 'published') return 'success'
  if (s === 'error' || s === 'rejected') return 'error'
  if (s === 'paused' || s === 'pending_review' || s === 'pending') return 'warning'
  return 'neutral'
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  pending_review: 'In review',
  active: 'Active',
  paused: 'Paused',
  rejected: 'Rejected',
  error: 'Failed',
  removed: 'Removed',
  published: 'Published',
}

function statusLabel(s: string): string {
  return STATUS_LABELS[s] || s
}

function platformLabel(p: string): string {
  if (p === 'google_ads') return 'Google Ads'
  if (p === 'meta_ads') return 'Meta Ads'
  return p
}
</script>

<template>
  <USlideover v-model:open="open" :ui="{ content: 'max-w-lg' }" side="right">
    <template #content>
      <div class="flex flex-col h-full">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-(--ui-border) shrink-0">
          <h2 class="text-sm font-bold">Publish to Meta Ads</h2>
          <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="handleClose" />
        </div>

        <!-- Step indicator -->
        <div class="px-5 py-3 border-b border-(--ui-border) shrink-0">
          <div class="flex items-center gap-1">
            <template v-for="(s, i) in STEPS" :key="s.num">
              <button
                class="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
                :class="step === s.num
                  ? 'bg-blue-500/10 text-blue-500'
                  : step > s.num
                    ? 'text-green-500'
                    : 'text-(--ui-text-muted)'"
                :disabled="s.num > step"
              >
                <span
                  class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                  :class="step === s.num
                    ? 'bg-blue-500 text-white'
                    : step > s.num
                      ? 'bg-green-500/20 text-green-500'
                      : 'bg-(--ui-bg) text-(--ui-text-muted)'"
                >
                  <UIcon v-if="step > s.num" name="i-lucide-check" class="w-3 h-3" />
                  <span v-else>{{ s.num }}</span>
                </span>
                <span class="hidden sm:inline">{{ s.label }}</span>
              </button>
              <UIcon
                v-if="i < STEPS.length - 1"
                name="i-lucide-chevron-right"
                class="w-3 h-3 text-(--ui-text-muted) shrink-0"
              />
            </template>
          </div>
        </div>

        <!-- Step content (scrollable) -->
        <div class="flex-1 overflow-y-auto px-5 py-4">
          <AdUploadStepAccount v-if="step === 1" />
          <AdUploadStepCampaign v-else-if="step === 2" />
          <AdUploadStepCreatives v-else-if="step === 3" :project-id="projectId" />
          <AdUploadStepText v-else-if="step === 4" />
          <AdUploadStepPreview v-else-if="step === 5" :project-id="projectId" />

          <!-- Publish history (shown at bottom of step 1) -->
          <div v-if="step === 1 && adPublishes?.length" class="mt-6 border-t border-(--ui-border) pt-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-xs font-bold uppercase tracking-wider text-(--ui-text-muted)">Recent Publishes</h3>
              <UButton
                variant="ghost"
                size="xs"
                color="neutral"
                icon="i-lucide-refresh-cw"
                :loading="isSyncingStatuses"
                @click="refreshStatuses"
              >
                Refresh
              </UButton>
            </div>
            <div class="space-y-1.5">
              <div
                v-for="ap in adPublishes.slice(0, 5)"
                :key="ap.id"
                class="flex items-center gap-2 px-3 py-2 rounded-lg border border-(--ui-border) text-xs"
              >
                <div class="flex-1 min-w-0">
                  <span class="font-medium">{{ FORMATS[ap.formatKey]?.name || ap.formatKey }}</span>
                  <span class="text-(--ui-text-muted) ml-1">{{ platformLabel(ap.platform) }}</span>
                  <div v-if="ap.errorMessage" class="text-[10px] text-red-500 truncate">{{ ap.errorMessage }}</div>
                </div>
                <UBadge :color="statusColor(ap.status)" variant="subtle" size="xs">{{ statusLabel(ap.status) }}</UBadge>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer navigation (hidden during upload) -->
        <div v-if="!isUploading" class="flex items-center justify-between px-5 py-3 border-t border-(--ui-border) shrink-0">
          <UButton
            v-if="step > 1 && !uploadComplete"
            variant="outline"
            size="sm"
            icon="i-lucide-arrow-left"
            @click="prevStep"
          >
            Back
          </UButton>
          <div v-else />

          <UButton
            v-if="step < 5"
            size="sm"
            :disabled="!canNext"
            @click="nextStep"
          >
            Next
            <template #trailing>
              <UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5" />
            </template>
          </UButton>

          <UButton
            v-if="uploadComplete"
            size="sm"
            @click="handleClose"
          >
            Done
          </UButton>
        </div>
      </div>
    </template>
  </USlideover>
</template>
