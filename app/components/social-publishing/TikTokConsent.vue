<script setup lang="ts">
import type { TikTokCreatorCapabilities } from '~~/shared/tiktokPosting'
import { TIKTOK_ELIGIBILITY_REASON } from '~~/shared/socialCapabilityReadiness'
const props = defineProps<{ clientId: string, accountId: string, content: string, mediaUrls: string[], payloadIdentity?: string, consentAvailable?: boolean }>()
const options = defineModel<Record<string, unknown>>({ default: () => ({}) })
const { data: creator, error } = await useFetch<TikTokCreatorCapabilities>(
  () => `/api/agency/social/publishing/accounts/${props.accountId}/creator-info`,
  { query: computed(() => ({ clientId: props.clientId })), watch: [() => props.accountId, () => props.clientId] }
)
function invalidateConsent(patch: Record<string, unknown> = {}) {
  const {consentPayload: _previousBinding, ...rest} = options.value
  options.value = {...rest,...patch,consent:false}
}
function set(key: string, value: unknown) { invalidateConsent({[key]:value}) }
watch([() => props.accountId, () => props.content, () => props.mediaUrls.join('|'), () => props.payloadIdentity], () => {
  if (!props.payloadIdentity || options.value.consentPayload !== props.payloadIdentity) invalidateConsent()
}, { immediate: true })
watch(() => props.accountId, () => { options.value = {} })
const video = computed(() => props.mediaUrls.some(url => /\.(mp4|mov|webm)(\?|$)/i.test(url)))
const consentText = computed(() => options.value.brand_content_toggle
  ? "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation"
  : "By posting, you agree to TikTok's Music Usage Confirmation")
</script>

<template>
  <section class="@container space-y-4 rounded-lg border border-default p-4 min-h-0 max-h-[36rem] overflow-y-auto">
    <UAlert color="warning" variant="soft" title="TikTok publishing unavailable" :description="TIKTOK_ELIGIBILITY_REASON" />
    <UAlert v-if="error" color="error" title="Creator settings unavailable" description="Reconnect the account before choosing posting settings." />
    <template v-if="creator">
      <div>
        <p class="font-semibold">{{ creator.creator_nickname }}</p>
        <p class="text-sm text-muted">@{{ creator.creator_username }}</p>
      </div>
      <div class="whitespace-pre-wrap break-words text-sm border-l-2 border-default pl-3">{{ content }}</div>
      <div class="flex gap-2 overflow-x-auto">
        <template v-for="url in mediaUrls" :key="url">
          <video v-if="/\.(mp4|mov|webm)(\?|$)/i.test(url)" :src="url" controls preload="metadata" class="h-32 rounded" />
          <img v-else :src="url" alt="Selected TikTok photo" class="h-32 rounded object-contain" />
        </template>
      </div>
      <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
        <UFormField label="Privacy" required>
          <USelect :model-value="options.privacy_level as string | undefined" :items="creator.privacy_level_options" placeholder="Choose who can see this post" class="w-full" @update:model-value="set('privacy_level', $event)" />
        </UFormField>
        <UFormField v-if="!video" label="Photo title" description="Up to 90 characters">
          <UInput :model-value="String(options.title ?? '')" :maxlength="90" class="w-full" @update:model-value="set('title', $event)" />
        </UFormField>
        <UFormField label="Interactions" class="@lg:col-span-2">
          <div class="space-y-2">
            <UCheckbox label="Allow comments" :model-value="options.disable_comment === false" :disabled="creator.comment_disabled" @update:model-value="set('disable_comment', !$event)" />
            <UCheckbox v-if="video" label="Allow Duet" :model-value="options.disable_duet === false" :disabled="creator.duet_disabled" @update:model-value="set('disable_duet', !$event)" />
            <UCheckbox v-if="video" label="Allow Stitch" :model-value="options.disable_stitch === false" :disabled="creator.stitch_disabled" @update:model-value="set('disable_stitch', !$event)" />
          </div>
        </UFormField>
        <UFormField label="Commercial disclosure" class="@lg:col-span-2">
          <div class="space-y-2">
            <UCheckbox label="Your brand — promotional content" :model-value="options.brand_organic_toggle === true" @update:model-value="set('brand_organic_toggle', $event)" />
            <UCheckbox label="Branded content — paid partnership (cannot be private)" :model-value="options.brand_content_toggle === true" @update:model-value="set('brand_content_toggle', $event)" />
            <UCheckbox label="AI-generated content" :model-value="options.is_aigc === true" @update:model-value="set('is_aigc', $event)" />
          </div>
        </UFormField>
        <UFormField label="Posting consent" class="@lg:col-span-2">
          <UCheckbox :label="consentText" :disabled="consentAvailable === false" :model-value="options.consent === true" @update:model-value="$event === true && payloadIdentity ? options = { ...options, consent: true, consentPayload: payloadIdentity } : invalidateConsent()" />
          <p v-if="consentAvailable === false" class="text-sm text-muted mt-2">Save and reload this draft before consenting so its exact media and tracked link can be previewed.</p>
          <p class="text-sm text-muted mt-2">Processing can take minutes. An accepted request does not mean the post is published.</p>
        </UFormField>
      </div>
    </template>
  </section>
</template>
