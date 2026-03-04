<script setup lang="ts">
import { FORMATS } from '~/utils/banner-constants'
import { CTA_OPTIONS } from '~/composables/useMetaAdUpload'

const props = defineProps<{
  projectId: string
}>()

const {
  selectedConnection,
  campaignName,
  adSetName,
  selectedCreatives,
  primaryTexts,
  headlines,
  descriptions,
  callToAction,
  linkUrl,
  adNamePattern,
  adStatus,
  uploadProgress,
  isUploading,
  uploadComplete,
  overallProgress,
  uploadAll,
} = useMetaAdUpload()

const toast = useToast()

const ctaLabel = computed(() => {
  const opt = CTA_OPTIONS.find(o => o.value === callToAction.value)
  return opt?.label || callToAction.value
})

const textCount = computed(() => {
  const p = primaryTexts.value.filter(t => t.trim()).length
  const h = headlines.value.filter(t => t.trim()).length
  const d = descriptions.value.filter(t => t.trim()).length
  return { primary: p, headlines: h, descriptions: d }
})

async function handlePublish() {
  try {
    await uploadAll(props.projectId)
    const errors = uploadProgress.value.filter(p => p.step === 'error')
    if (errors.length) {
      toast.add({
        title: 'Partial Upload',
        description: `${errors.length} of ${uploadProgress.value.length} failed`,
        color: 'warning',
      })
    } else {
      toast.add({
        title: 'All Ads Published',
        description: `${uploadProgress.value.length} ad(s) created successfully`,
        color: 'success',
      })
    }
  } catch (err: any) {
    toast.add({
      title: 'Upload Failed',
      description: err.message || 'An unexpected error occurred',
      color: 'error',
    })
  }
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h3 class="text-sm font-semibold mb-1">Review & Publish</h3>
      <p class="text-xs text-(--ui-text-muted)">
        Review your selections before publishing to Meta Ads.
      </p>
    </div>

    <!-- Summary card -->
    <div v-if="!isUploading && !uploadComplete" class="space-y-3">
      <div class="rounded-lg border border-(--ui-border) divide-y divide-(--ui-border)">
        <div class="flex items-center justify-between px-3 py-2">
          <span class="text-xs text-(--ui-text-muted)">Account</span>
          <span class="text-xs font-medium">{{ selectedConnection?.accountName || 'N/A' }}</span>
        </div>
        <div class="flex items-center justify-between px-3 py-2">
          <span class="text-xs text-(--ui-text-muted)">Campaign</span>
          <span class="text-xs font-medium">{{ campaignName }}</span>
        </div>
        <div class="flex items-center justify-between px-3 py-2">
          <span class="text-xs text-(--ui-text-muted)">Ad Set</span>
          <span class="text-xs font-medium">{{ adSetName }}</span>
        </div>
        <div class="flex items-center justify-between px-3 py-2">
          <span class="text-xs text-(--ui-text-muted)">Creatives</span>
          <span class="text-xs font-medium">{{ selectedCreatives.length }} banner{{ selectedCreatives.length !== 1 ? 's' : '' }}</span>
        </div>
        <div class="flex items-center justify-between px-3 py-2">
          <span class="text-xs text-(--ui-text-muted)">Text Variations</span>
          <span class="text-xs font-medium">
            {{ textCount.primary }}P / {{ textCount.headlines }}H / {{ textCount.descriptions }}D
          </span>
        </div>
        <div class="flex items-center justify-between px-3 py-2">
          <span class="text-xs text-(--ui-text-muted)">CTA</span>
          <span class="text-xs font-medium">{{ ctaLabel }}</span>
        </div>
        <div class="flex items-center justify-between px-3 py-2">
          <span class="text-xs text-(--ui-text-muted)">Link</span>
          <span class="text-xs font-medium truncate max-w-[200px]">{{ linkUrl }}</span>
        </div>
      </div>

      <!-- Creatives list -->
      <div>
        <span class="text-xs font-medium text-(--ui-text-muted) block mb-1.5">Creatives to Upload</span>
        <div class="space-y-1">
          <div
            v-for="c in selectedCreatives"
            :key="c.id"
            class="flex items-center gap-2 px-3 py-1.5 rounded-md bg-(--ui-bg) text-xs"
          >
            <div class="w-8 h-8 rounded border border-(--ui-border) overflow-hidden shrink-0">
              <img v-if="c.url" :src="c.url" class="w-full h-full object-contain" />
            </div>
            <span class="font-medium">{{ FORMATS[c.formatKey]?.name || c.formatKey }}</span>
            <span class="text-(--ui-text-muted)">{{ c.width }}x{{ c.height }}</span>
          </div>
        </div>
      </div>

      <!-- Ad name pattern -->
      <div>
        <label class="text-xs font-medium block mb-1.5">Ad Name Pattern</label>
        <UInput v-model="adNamePattern" size="sm" />
        <p class="text-[10px] text-(--ui-text-muted) mt-0.5">
          Variables: {'{'}ProjectName{'}'}, {'{'}Format{'}'}, {'{'}Date{'}'}
        </p>
      </div>

      <!-- Status toggle -->
      <div class="flex items-center justify-between">
        <div>
          <label class="text-xs font-medium block">Initial Ad Status</label>
          <p class="text-[10px] text-(--ui-text-muted)">Paused is recommended for review before going live</p>
        </div>
        <div class="flex gap-1 p-0.5 bg-(--ui-bg) rounded-md">
          <button
            class="px-3 py-1 text-xs rounded-md transition-colors"
            :class="adStatus === 'PAUSED' ? 'bg-(--ui-bg-elevated) font-medium shadow-sm' : 'text-(--ui-text-muted)'"
            @click="adStatus = 'PAUSED'"
          >
            Paused
          </button>
          <button
            class="px-3 py-1 text-xs rounded-md transition-colors"
            :class="adStatus === 'ACTIVE' ? 'bg-green-500/10 text-green-500 font-medium shadow-sm' : 'text-(--ui-text-muted)'"
            @click="adStatus = 'ACTIVE'"
          >
            Active
          </button>
        </div>
      </div>

      <!-- Publish button -->
      <UButton
        label="Publish to Meta Ads"
        icon="i-lucide-send"
        block
        size="md"
        @click="handlePublish"
      />
    </div>

    <!-- Upload progress -->
    <AdUploadUploadProgress
      v-if="isUploading || uploadComplete"
      :items="uploadProgress"
      :overall-progress="overallProgress"
      :is-uploading="isUploading"
    />

    <!-- Done message -->
    <div v-if="uploadComplete && !isUploading" class="text-center py-4">
      <UIcon name="i-lucide-check-circle-2" class="w-10 h-10 text-green-500 mx-auto mb-2" />
      <p class="text-sm font-medium">Upload Complete</p>
      <p class="text-xs text-(--ui-text-muted) mt-1">
        Check your Meta Ads Manager to review the created ads.
      </p>
    </div>
  </div>
</template>
