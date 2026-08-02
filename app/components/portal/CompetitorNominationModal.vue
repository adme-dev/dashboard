<script setup lang="ts">
import type { NearbyMarketRadius } from '~/types/site-intelligence'

const props = defineProps<{
  candidate: { placeId: string, displayName: string } | null
  marketLocationId: string | null
  radiusKm: NearbyMarketRadius
}>()
const emit = defineEmits<{ nominated: [placeId: string] }>()
const open = defineModel<boolean>('open', { default: false })
const toast = useToast()
const reason = ref('')
const submitting = ref(false)
const submitError = ref('')
const canSubmit = computed(() => {
  const length = reason.value.trim().length
  return Boolean(props.candidate && props.marketLocationId && length > 0 && length <= 1000)
})

watch([open, () => props.candidate?.placeId], () => {
  reason.value = ''
  submitError.value = ''
})

async function submitNomination() {
  const candidate = props.candidate
  const marketLocationId = props.marketLocationId
  if (!candidate || !marketLocationId || !canSubmit.value) return

  submitting.value = true
  submitError.value = ''
  try {
    await $fetch(`/api/client-portal/site-intelligence/candidates/${candidate.placeId}/nominate`, {
      method: 'POST',
      body: {
        marketLocationId,
        radiusKm: props.radiusKm,
        reason: reason.value.trim()
      }
    })
    emit('nominated', candidate.placeId)
    open.value = false
    toast.add({
      title: 'Competitor nominated',
      description: 'Your agency can now review this dealership.',
      color: 'success'
    })
  } catch {
    submitError.value = 'The nomination could not be sent. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Nominate a competitor">
    <template #content>
      <div class="@container space-y-5 p-5 sm:p-6">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-primary">
            Agency review request
          </p>
          <h2 class="mt-1 text-lg font-semibold text-highlighted">
            {{ candidate?.displayName || 'Selected dealership' }}
          </h2>
          <p class="mt-1 text-sm leading-6 text-muted">
            Tell your agency why this dealership matters to your local market.
          </p>
        </div>

        <UAlert
          color="info"
          variant="subtle"
          icon="i-lucide-shield-check"
          title="Agency approval stays in control"
          description="A nomination does not start indexing. Your agency must review and approve it separately."
        />

        <UAlert
          v-if="submitError"
          role="alert"
          color="error"
          variant="subtle"
          title="Nomination unavailable"
          :description="submitError"
        />

        <UFormField
          label="Reason"
          help="Required · up to 1,000 characters"
          :error="reason.length > 1000 ? 'Keep the reason to 1,000 characters or fewer.' : undefined"
        >
          <UTextarea
            v-model="reason"
            class="w-full"
            :rows="5"
            maxlength="1000"
            required
            aria-required="true"
            placeholder="For example: they compete for the same buyers in our primary sales area."
          />
        </UFormField>

        <div class="flex flex-col-reverse gap-2 @sm:flex-row @sm:justify-end">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            class="justify-center"
            @click="open = false"
          />
          <UButton
            label="Send nomination"
            icon="i-lucide-send"
            class="justify-center"
            :loading="submitting"
            :disabled="!canSubmit"
            @click="submitNomination"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
