<script setup lang="ts">
const props = defineProps<{ taskId: string }>()
interface PublishingState {
  clientId: string
  briefId: string | null
  post: { id: string, status: string, scheduledAt: string | null, publishedAt: string | null, delivery?: { state: string, confirmed: number, total: number, removed: number, publishedAt: string | null } } | null
  drafts: { id: string, content: string | null }[]
}
const state = ref<PublishingState | null>(null)
const pending = ref(false)
const saving = ref(false)
const error = ref('')
const choice = ref('_new')
let version = 0
const options = computed(() => [{ label: 'Create a new draft', value: '_new' }, ...(state.value?.drafts || []).map(post => ({ label: post.content || `Untitled draft (${post.id.slice(0, 8)})`, value: post.id }))])
const delivery = computed(() => state.value?.post?.delivery)
const deliveryTitle = computed(() => ({ confirmed: 'Delivery confirmed', partial: 'Delivery needs attention', unverified: 'Delivery receipt unavailable', pending: 'Awaiting delivery' })[delivery.value?.state || 'pending'])
const postUrl = computed(() => state.value?.post ? `/agency/social/publishing/compose?edit=${state.value.post.id}&client=${state.value.clientId}` : undefined)
async function load() {
  const current = ++version
  state.value = null
  error.value = ''
  choice.value = '_new'
  pending.value = true
  try {
    const data = await $fetch<PublishingState>(`/api/agency/tasks/${props.taskId}/publishing`)
    if (current === version) state.value = data
  } catch (failure: unknown) {
    if (current === version) error.value = (failure as { data?: { statusMessage?: string } }).data?.statusMessage || 'Unable to load publishing. Try again.'
  } finally {
    if (current === version) pending.value = false
  }
}
async function handoff() {
  if (saving.value || !state.value) return
  saving.value = true
  error.value = ''
  const current = version
  try {
    const data = await $fetch<Omit<PublishingState, 'drafts'>>(`/api/agency/tasks/${props.taskId}/publishing`, {
      method: 'POST', body: choice.value === '_new' ? {} : { postId: choice.value }
    })
    if (current === version) state.value = { ...data, drafts: [] }
  } catch (failure: unknown) {
    if (current === version) error.value = (failure as { data?: { statusMessage?: string } }).data?.statusMessage || 'Unable to prepare publishing. Retry to reopen any saved draft.'
  } finally { saving.value = false }
}
watch(() => props.taskId, load, { immediate: true })
</script>

<template>
  <section class="space-y-4 border-t border-default pt-6" aria-label="Task publishing">
    <div>
      <h2 class="font-semibold">
        Publishing
      </h2>
      <p class="text-sm text-muted">
        Keep this deliverable connected to its client’s Planner draft.
      </p>
    </div>
    <p v-if="pending" class="text-sm text-muted" role="status">
      Loading publishing…
    </p>
    <UAlert v-if="error" color="error" :description="error" />
    <UButton v-if="error && !state" variant="outline" @click="load">
      Try again
    </UButton>
    <template v-if="state">
      <div v-if="state.post" class="space-y-3">
        <p class="text-sm">
          Saved status: <strong>{{ state.post.status }}</strong>
        </p>
        <p v-if="!['published', 'partially_published'].includes(state.post.status)" class="text-sm text-muted">
          Linking a draft does not approve or schedule it. Confirm the copy, media, customer approval and publishing account in the composer.
        </p>
        <UAlert
          v-if="delivery"
          :color="delivery.state === 'confirmed' && !delivery.removed ? 'success' : delivery.state === 'pending' ? 'neutral' : 'warning'"
          variant="soft"
          :title="deliveryTitle"
          :description="`${delivery.confirmed} of ${delivery.total} destination accounts have saved provider confirmations.${delivery.removed ? ` ${delivery.removed} subsequently removed from Facebook.` : ''} Review the delivery before completing this task; task and brief approvals still apply.`"
        />
        <p v-if="delivery?.publishedAt" class="text-xs text-muted">
          Published {{ new Date(delivery.publishedAt).toLocaleString() }}
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton variant="outline" :disabled="saving" @click="load">
            Refresh delivery
          </UButton>
          <UButton :to="`/agency/social/publishing/wall?client=${state.clientId}`" variant="outline">
            Publication archive
          </UButton>
          <UButton :to="postUrl" icon="i-lucide-square-pen">
            Open linked post
          </UButton>
          <UButton :to="`/agency/social/publishing/planner?client=${state.clientId}`" variant="outline">
            Client Planner
          </UButton>
        </div>
      </div>
      <div v-else class="space-y-3 max-w-xl">
        <UFormField label="Publishing draft" help="Only this client’s unreviewed, unlinked drafts are shown. Existing copy and media are preserved.">
          <USelectMenu
            v-model="choice"
            :items="options"
            value-key="value"
            class="w-full"
            :disabled="saving"
          />
        </UFormField>
        <UButton :loading="saving" :disabled="pending" @click="handoff">
          {{ choice === '_new' ? 'Create linked draft' : 'Link selected draft' }}
        </UButton>
      </div>
      <UButton
        v-if="state.briefId"
        :to="`/agency/briefs/${state.briefId}`"
        variant="link"
        class="px-0"
      >
        Review source brief
      </UButton>
    </template>
  </section>
</template>
