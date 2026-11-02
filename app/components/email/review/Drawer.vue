<!-- app/components/email/review/Drawer.vue -->
<!-- Slide-over host for the M06 review workflow on a saved template or
     campaign. Campaigns also get their link settings (UTM + web version). -->
<script setup lang="ts">
import type { ReviewKind, ReviewView } from '~~/app/utils/emailReviewClient'

const props = defineProps<{
  kind: ReviewKind
  targetId: string | null
  title?: string
  clientId?: string | null
  /** Campaign status as listed; only drafts may change link settings. */
  status?: string | null
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ changed: [] }>()

const tab = ref<'review' | 'links'>('review')
const panelKey = ref(0)
const liveStatus = ref<string | null>(null)

watch(() => props.targetId, () => {
  tab.value = 'review'
  liveStatus.value = null
})

const tabs = computed(() => [
  { label: 'Review', value: 'review', icon: 'i-lucide-message-square-text' },
  ...(props.kind === 'campaign' ? [{ label: 'Links & web version', value: 'links', icon: 'i-lucide-link' }] : [])
])
const editable = computed(() => (liveStatus.value ?? props.status ?? 'draft') === 'draft')

function onReviewChanged(view: ReviewView) {
  liveStatus.value = view.status
  emit('changed')
}

function onSettingsSaved() {
  // Settings are part of the approved fingerprint; reload review state.
  panelKey.value += 1
  emit('changed')
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="title ? `Review · ${title}` : 'Review'"
    description="Comments, approval and delivery links for the saved version."
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #body>
      <div v-if="targetId" class="flex h-full min-h-0 flex-col gap-4">
        <UTabs
          v-if="tabs.length > 1"
          v-model="tab"
          :items="tabs"
          :content="false"
          size="sm"
        />
        <EmailReviewPanel
          v-show="tab === 'review'"
          :key="panelKey"
          :kind="kind"
          :target-id="targetId"
          :client-id="clientId"
          class="min-h-0 flex-1"
          @changed="onReviewChanged"
        />
        <EmailReviewCampaignSettings
          v-if="kind === 'campaign' && tab === 'links'"
          :campaign-id="targetId"
          :editable="editable"
          @saved="onSettingsSaved"
        />
      </div>
    </template>
  </USlideover>
</template>
