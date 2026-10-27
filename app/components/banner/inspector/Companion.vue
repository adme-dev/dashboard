<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { useBannerCompanion } from '~/composables/useBannerCompanion'
import { isDarkColor, normaliseHex } from '~/utils/banner-brand-kit'
import { bannerFontFamily } from '~/utils/banner-font-family'
import type { Layer } from '~/types/banner-studio'

const api = useBannerCompanion()
const {
  opened,
  loading,
  error,
  status,
  request,
  proposal,
  reviewed,
  blockReason,
  canApply,
  beforeLayer,
  previewLayer
} = api
const file = ref<File | null>(null)
const previewHost = ref<HTMLElement | null>(null)
const width = ref(0)
let resizeFrame: number | undefined
// Measure stable available width; defer dependent preview heights out of the
// ResizeObserver delivery cycle to avoid a same-frame feedback notification.
useResizeObserver(previewHost, ([entry]) => {
  if (!entry) return
  if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame)
  resizeFrame = undefined
  if (entry.contentRect.width === width.value) return
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = undefined
    if (previewHost.value === entry.target) width.value = entry.contentRect.width
  })
})
onScopeDispose(() => {
  if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame)
})
const scale = computed(() => (beforeLayer.value ? Math.min(1, Math.max(1, width.value) / beforeLayer.value.w) : 1))
const previewHeight = computed(() => `${(beforeLayer.value?.h || 1) * scale.value}px`)
const previews = computed(() => [
  { label: 'Before', layer: beforeLayer.value, testid: 'companion-before' },
  { label: 'After', layer: previewLayer.value, testid: 'companion-after' }
])
function textStyle(layer: Layer) {
  return {
    width: `${layer.w}px`,
    height: `${layer.h}px`,
    transform: `scale(${scale.value})`,
    transformOrigin: 'top left',
    fontFamily: bannerFontFamily(layer.fontFamily),
    fontWeight: layer.fontWeight,
    fontSize: `${layer.fontSize}px`,
    lineHeight: layer.lineHeight || 1.2,
    color: layer.color,
    opacity: layer.opacity,
    fontStyle: layer.fontStyle || 'normal',
    letterSpacing: layer.letterSpacing || 'normal',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const
  }
}
function chooseFile(value: File | null | undefined) {
  file.value = value || null
  if (value) void api.importFile(value)
  else api.discard()
}
watch(request, () => {
  file.value = null
})
</script>

<template>
  <section ref="previewHost" class="space-y-3 @container border-b border-default pb-3" data-testid="companion-inspector">
    <UButton
      label="Companion wording"
      icon="i-lucide-file-input"
      variant="soft"
      size="xs"
      class="w-full"
      data-testid="companion-open"
      @click="api.open()"
    />
    <div v-if="opened" class="space-y-4">
      <p class="text-xs text-muted">
        Download this heading with its artwork for the local Linux companion. Bring back the returned wording file, then
        review it here.
      </p>
      <UAlert
        v-if="blockReason"
        color="warning"
        title="Unsupported selected heading"
        :description="blockReason"
        data-testid="companion-unsupported"
      />
      <UButton
        :label="request ? 'Download a new request' : 'Download companion request'"
        icon="i-lucide-download"
        class="w-full"
        size="xs"
        :loading="loading && !request"
        :disabled="!!blockReason || loading"
        data-testid="companion-download"
        @click="api.downloadRequest()"
      />
      <p v-if="request" class="text-xs text-muted" data-testid="companion-request-ready">
        Request ready. Keep this review open and the artwork unchanged while the companion runs.
      </p>
      <p v-else-if="status !== 'applied'" class="text-xs text-muted" data-testid="companion-missing-request">
        Download a request in this session first. An imported file cannot restore an earlier request.
      </p>
      <UFormField label="Returned wording file" description="Import the companion’s JSON result, up to 64 KiB.">
        <UFileUpload
          :model-value="file"
          accept=".json,application/json"
          label="Choose returned wording JSON"
          size="sm"
          class="w-full"
          :disabled="!request || loading || !!blockReason"
          data-testid="companion-file"
          @update:model-value="chooseFile"
        />
      </UFormField>
      <UAlert
        v-if="error"
        color="error"
        :description="error"
        data-testid="companion-error"
      />
      <p v-if="loading && request" class="text-xs text-muted" role="status">
        Checking wording and exact font fit…
      </p>
      <div
        v-if="proposal && beforeLayer && previewLayer"
        class="space-y-3"
        data-testid="companion-preview"
      >
        <figure v-for="preview in previews" :key="preview.label" class="m-0 space-y-1">
          <figcaption class="text-xs font-medium">
            {{ preview.label }}
          </figcaption>
          <div
            class="relative overflow-hidden rounded ring-1 ring-default"
            :style="{ height: previewHeight, backgroundColor: isDarkColor(normaliseHex(preview.layer?.color || '') || undefined) ? '#ffffff' : '#111827' }"
          >
            <div v-if="preview.layer" :style="textStyle(preview.layer)" :data-testid="preview.testid">
              {{ preview.layer.text }}
            </div>
          </div>
          <p class="text-xs break-words" :data-testid="`${preview.testid}-wording`">
            {{ preview.layer?.text }}
          </p>
        </figure>
        <p class="text-xs text-muted">
          Same heading box, font and style, on a contrasting preview background. Review the words and meaning; detected facts are screened, but claims still
          need your judgment.
        </p>
        <p class="text-xs text-muted" data-testid="companion-engine">
          File declares {{ proposal.engine.name }} {{ proposal.engine.version }} on Linux. This declaration is
          unverified.
        </p>
        <UCheckbox
          v-model="reviewed"
          label="I reviewed the exact wording, meaning and fit."
          :disabled="loading"
          data-testid="companion-reviewed"
        />
        <UButton
          label="Apply reviewed wording"
          class="w-full"
          :disabled="!canApply"
          :loading="loading"
          data-testid="companion-apply"
          @click="api.apply()"
        />
        <UButton
          label="Discard preview"
          variant="ghost"
          color="neutral"
          size="xs"
          data-testid="companion-discard"
          @click="api.discard()"
        />
      </div>
      <UAlert
        v-if="status === 'applied'"
        color="success"
        title="Wording applied"
        description="Undo restores the previous heading. Save the artwork to keep this change."
        data-testid="companion-applied"
      />
      <UButton
        :label="loading ? 'Cancel companion review' : 'Close companion review'"
        variant="ghost"
        color="neutral"
        size="xs"
        data-testid="companion-close"
        @click="api.close()"
      />
    </div>
  </section>
</template>
