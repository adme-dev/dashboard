<script setup lang="ts">
import { SOCIAL_IMAGE_FORMATS, type SocialImageFormat, type SocialImagePreview } from '~~/shared/social/imageRecomposition'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ clientId: string | null, postId: string | null, sourceUrl: string }>()
const emit = defineEmits<{ apply: [preview: SocialImagePreview] }>()
const format = ref<SocialImageFormat>('portrait')
const instruction = ref('')
const busy = ref(false)
const error = ref('')
const result = ref<SocialImagePreview | null>(null)
const reviewed = ref(false)
const dimensions = ref<{ width: number, height: number } | null>(null)
let generation = 0
const formats = Object.entries(SOCIAL_IMAGE_FORMATS).map(([value, item]) => ({ value, label: item.label }))
const ratioMatches = computed(() => dimensions.value && result.value
  && Math.abs(dimensions.value.width / dimensions.value.height - result.value.width / result.value.height) < 0.01)
function reset() {
  generation++
  result.value = null
  dimensions.value = null
  reviewed.value = false
  error.value = ''
  busy.value = false
}
watch(() => [props.clientId, props.postId, props.sourceUrl, open.value], reset)
watch(() => [props.clientId, props.postId, props.sourceUrl], () => {
  instruction.value = ''
})
watch(format, () => {
  result.value = null
  dimensions.value = null
  reviewed.value = false
})
async function generate() {
  if (!props.clientId || !props.postId || busy.value) return
  const current = ++generation
  busy.value = true
  error.value = ''
  result.value = null
  dimensions.value = null
  reviewed.value = false
  try {
    const preview = await $fetch<SocialImagePreview>('/api/agency/social/publishing/ai/recompose-image', {
      method: 'POST', retry: 0, timeout: 240000,
      body: { clientId: props.clientId, postId: props.postId, sourceUrl: props.sourceUrl, format: format.value, instruction: instruction.value }
    })
    if (current === generation) result.value = preview
  } catch (err: unknown) {
    if (current === generation) error.value = (err as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Could not generate a preview. Your original is unchanged.'
  } finally {
    if (current === generation) busy.value = false
  }
}
function loaded(event: Event) {
  const img = event.target as HTMLImageElement
  dimensions.value = { width: img.naturalWidth, height: img.naturalHeight }
}
function apply() {
  if (!result.value || !reviewed.value || !ratioMatches.value) return
  emit('apply', { ...result.value, ...dimensions.value! })
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :dismissible="!busy" :ui="{ content: 'sm:max-w-5xl' }">
    <template #content>
      <div class="@container max-h-[90dvh] overflow-y-auto p-5 sm:p-6">
        <div class="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 class="text-xl font-semibold">
              Resize with AI
            </h2>
            <p class="mt-1 max-w-prose text-sm text-muted">
              Recompose your artwork for a new format. Preview it here before changing the draft.
            </p>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            :disabled="busy"
            aria-label="Close image editor"
            @click="open = false"
          />
        </div>
        <div class="grid grid-cols-1 gap-4 @2xl:grid-cols-[16rem_minmax(0,1fr)]">
          <UFormField label="Output format" help="High-resolution output · 2K. Final dimensions appear in the preview.">
            <USelect
              v-model="format"
              :items="formats"
              :disabled="busy"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Instructions" hint="Optional" help="For example: keep the headline above the vehicle and the demo button at the bottom.">
            <UTextarea
              v-model="instruction"
              :rows="2"
              :maxlength="500"
              :disabled="busy"
              class="w-full"
            />
          </UFormField>
        </div>
        <UAlert
          v-if="error"
          class="mt-4"
          color="error"
          variant="soft"
          title="Preview unavailable"
          :description="error"
        />
        <div class="mt-5 grid grid-cols-1 gap-4 @2xl:grid-cols-2">
          <figure class="min-w-0">
            <figcaption class="mb-2 text-sm font-medium">
              Original
            </figcaption>
            <div class="flex h-80 items-center justify-center rounded-lg border border-default bg-elevated p-2">
              <img :src="sourceUrl" alt="Original artwork" class="max-h-full max-w-full object-contain">
            </div>
          </figure>
          <figure class="min-w-0">
            <figcaption class="mb-2 text-sm font-medium">
              AI preview <span v-if="dimensions" class="font-normal text-muted">· {{ dimensions.width }} × {{ dimensions.height }}</span>
            </figcaption>
            <div class="flex h-80 items-center justify-center rounded-lg border border-default bg-elevated p-2">
              <img
                v-if="result"
                :src="result.url"
                alt="Recomposed artwork for review"
                class="max-h-full max-w-full object-contain"
                @load="loaded"
                @error="error = 'The preview image could not load. Keep the original or try again.'"
              >
              <div
                v-else
                class="max-w-64 text-center text-sm text-muted"
                role="status"
                aria-live="polite"
              >
                <UIcon :name="busy ? 'i-lucide-loader-circle' : 'i-lucide-scan'" :class="['mb-3 size-7', busy ? 'animate-spin motion-reduce:animate-none' : '']" />
                <p>{{ busy ? 'Recomposing your artwork. This may take a few minutes.' : 'Choose a format and generate a preview.' }}</p>
              </div>
            </div>
          </figure>
        </div>
        <UButton
          v-if="result"
          :to="result.url"
          target="_blank"
          color="neutral"
          variant="link"
          icon="i-lucide-external-link"
          class="mt-3"
        >
          Open full-size preview
        </UButton>
        <p class="mt-4 text-sm text-muted">
          AI can change lettering or details. Check the copy, logos and vehicles before using the result. Your original remains available.
        </p>
        <p v-if="result && dimensions && !ratioMatches" class="mt-2 text-sm text-error">
          The returned image does not match the chosen shape. Generate another preview.
        </p>
        <UCheckbox
          v-if="result"
          v-model="reviewed"
          class="mt-4"
          label="I’ve checked the text, branding and image details."
        />
        <div class="mt-5 flex flex-wrap justify-end gap-2 border-t border-default pt-4">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="busy"
            @click="open = false"
          >
            Keep original
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-sparkles"
            :loading="busy"
            :disabled="!postId || !clientId"
            @click="generate"
          >
            {{ result ? 'Generate another' : 'Generate preview' }}
          </UButton>
          <UButton v-if="result" :disabled="busy || !reviewed || !ratioMatches" @click="apply">
            Use this version
          </UButton>
        </div>
        <p class="mt-3 text-right text-xs text-muted">
          Using a version changes this draft. Save it and review again before publishing.
        </p>
      </div>
    </template>
  </UModal>
</template>
