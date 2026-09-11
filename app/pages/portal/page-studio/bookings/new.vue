<script setup lang="ts">
definePageMeta({ layout: 'portal' })
useHead({ title: 'Booking enquiry | XeroFlow' })
const toast = useToast()
const { siteId, selectSite } = usePageStudioBookingSite()
const requestId = ref(crypto.randomUUID())
const saving = ref(false)
const errorMessage = ref<string | null>(null)
const turnstileSiteKey = computed(() => String(useRuntimeConfig().public.turnstileSiteKey || ''))
const turnstileToken = ref('')
const captchaAttempt = ref(0)
watch(siteId, () => {
  requestId.value = crypto.randomUUID()
  turnstileToken.value = ''
  captchaAttempt.value++
})
const form = reactive({
  name: '', email: '', phone: '', pickup: '', dropoff: '', travelAt: '',
  durationMinutes: 60, passengers: 1, occasion: ''
})
async function submit() {
  if (saving.value) return
  errorMessage.value = null
  if (!siteId.value) {
    errorMessage.value = 'Choose the website for this enquiry.'
    return
  }
  if (!form.name || !form.email || !form.phone || !form.pickup || !form.dropoff || !form.travelAt) {
    errorMessage.value = 'Complete the required customer and trip details.'
    return
  }
  if (!turnstileToken.value) {
    errorMessage.value = turnstileSiteKey.value
      ? 'Complete the human verification challenge before submitting.'
      : 'Booking security is not configured for this portal. Ask your agency to enable Cloudflare Turnstile.'
    return
  }
  const submittedSiteId = siteId.value
  saving.value = true
  try {
    await $fetch('/api/portal/page-studio/bookings', {
      method: 'POST',
      query: { siteId: submittedSiteId },
      headers: { 'x-turnstile-token': turnstileToken.value },
      body: {
        bookingId: requestId.value, requestKey: requestId.value,
        customer: { name: form.name, email: form.email, phone: form.phone },
        pickup: form.pickup, dropoff: form.dropoff, travelAt: form.travelAt,
        durationMinutes: form.durationMinutes, passengers: form.passengers,
        occasion: form.occasion, vehicleId: null
      }
    })
    toast.add({ title: 'Enquiry submitted', description: 'Your agency will review the trip and follow up with a quote.', color: 'success' })
    await navigateTo({ path: '/portal/page-studio/bookings', query: { siteId: submittedSiteId } })
  } catch (error: unknown) {
    errorMessage.value = error && typeof error === 'object' && 'data' in error && error.data && typeof error.data === 'object' && 'statusMessage' in error.data ? String(error.data.statusMessage) : 'The booking enquiry could not be submitted.'
  } finally {
    turnstileToken.value = ''
    captchaAttempt.value++
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        Booking enquiry
      </p><h1 class="mt-2 text-2xl font-semibold text-highlighted">
        Request a trip
      </h1><p class="mt-2 text-sm leading-6 text-muted">
        Send the details to your agency. A human operator will review availability and issue a quote.
      </p>
    </div>
    <UAlert
      v-if="errorMessage"
      color="error"
      title="Enquiry not submitted"
      :description="errorMessage"
    />
    <UCard>
      <PageStudioBookingSitePicker
        audience="portal"
        :site-id="siteId"
        :disabled="saving"
        class="mb-5"
        @update:site-id="selectSite"
      />
      <div class="@container space-y-5">
        <UAlert
          v-if="!turnstileSiteKey"
          color="warning"
          variant="subtle"
          icon="i-lucide-shield-alert"
          title="Booking security is not configured"
          description="Cloudflare Turnstile must be enabled before this form can submit an enquiry."
        />
        <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
          <UFormField label="Name" required>
            <UInput v-model="form.name" class="w-full" />
          </UFormField>
          <UFormField label="Email" required>
            <UInput v-model="form.email" type="email" class="w-full" />
          </UFormField>
          <UFormField label="Phone" required>
            <UInput v-model="form.phone" class="w-full" />
          </UFormField>
          <UFormField label="Occasion">
            <UInput v-model="form.occasion" class="w-full" placeholder="Airport transfer, wedding..." />
          </UFormField>
          <UFormField label="Pickup location" required>
            <UInput v-model="form.pickup" class="w-full" />
          </UFormField>
          <UFormField label="Drop-off location" required>
            <UInput v-model="form.dropoff" class="w-full" />
          </UFormField>
          <UFormField label="Travel time" help="Use an ISO 8601 timestamp." required>
            <UInput v-model="form.travelAt" class="w-full" placeholder="2026-10-01T10:00:00+10:00" />
          </UFormField>
          <UFormField label="Passengers" required>
            <UInput
              v-model.number="form.passengers"
              type="number"
              min="1"
              max="500"
              class="w-full"
            />
          </UFormField>
        </div>
        <EmailPublicTurnstile
          v-if="turnstileSiteKey"
          :key="captchaAttempt"
          :site-key="turnstileSiteKey"
          theme="dark"
          @verified="turnstileToken = $event"
          @expired="turnstileToken = ''"
        />
        <div class="flex justify-end">
          <UButton
            label="Submit enquiry"
            color="primary"
            :loading="saving"
            :disabled="!siteId || !turnstileSiteKey"
            @click="submit"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>
