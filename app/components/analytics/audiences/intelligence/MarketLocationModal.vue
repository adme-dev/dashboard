<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ClientMarketLocation } from '~/types/site-intelligence'

interface AddressChoice {
  placeId: string
  displayName: string
  formattedAddress: string
}

const props = defineProps<{
  open: boolean
  clientId: string | null
  location: ClientMarketLocation | null
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': [location: ClientMarketLocation]
}>()

const addressText = ref('')
const label = ref('Main showroom')
const choices = ref<AddressChoice[]>([])
const selectedPlaceId = ref<string | undefined>()
const pending = ref(false)
const error = ref<string | null>(null)

const modalOpen = computed({
  get: () => props.open,
  set: value => emit('update:open', value)
})
const choiceItems = computed(() => choices.value.map(choice => ({
  label: `${choice.displayName} — ${choice.formattedAddress}`,
  value: choice.placeId
})))
const selectedChoice = computed(() => choices.value.find(choice => choice.placeId === selectedPlaceId.value))

watch(() => props.open, (open) => {
  if (!open) return
  addressText.value = props.location?.addressText ?? ''
  label.value = props.location?.label ?? 'Main showroom'
  choices.value = []
  selectedPlaceId.value = undefined
  error.value = null
})

async function previewAddress() {
  if (!props.clientId || !addressText.value.trim()) return
  pending.value = true
  error.value = null
  try {
    const response = await $fetch<{ choices: AddressChoice[] }>(
      `/api/agency/site-intelligence/market-locations/${props.clientId}`,
      { method: 'PUT', body: { action: 'preview', addressText: addressText.value.trim() } }
    )
    choices.value = response.choices
    selectedPlaceId.value = undefined
  } catch (cause: unknown) {
    const candidate = cause as { data?: { statusMessage?: string }, message?: string }
    error.value = candidate.data?.statusMessage || candidate.message || 'Address preview is unavailable.'
  } finally {
    pending.value = false
  }
}

async function confirmLocation() {
  if (!props.clientId || !selectedChoice.value || !label.value.trim()) return
  pending.value = true
  error.value = null
  try {
    const response = await $fetch<{ marketLocation: ClientMarketLocation }>(
      `/api/agency/site-intelligence/market-locations/${props.clientId}`,
      {
        method: 'PUT',
        body: {
          action: 'confirm',
          placeId: selectedChoice.value.placeId,
          label: label.value.trim(),
          addressText: selectedChoice.value.formattedAddress
        }
      }
    )
    emit('saved', response.marketLocation)
    modalOpen.value = false
  } catch (cause: unknown) {
    const candidate = cause as { data?: { statusMessage?: string }, message?: string }
    error.value = candidate.data?.statusMessage || candidate.message || 'The market location could not be confirmed.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UModal v-model:open="modalOpen" title="Confirm market location">
    <template #content>
      <div class="@container space-y-5 p-5 sm:p-6">
        <div>
          <h2 class="text-lg font-semibold text-highlighted">
            Confirm market location
          </h2>
          <p class="mt-1 text-sm leading-6 text-muted">
            Search for the trading address, review the provider preview, then explicitly confirm the correct location.
          </p>
        </div>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          title="Location unavailable"
          :description="error"
        />

        <div class="grid grid-cols-1 gap-4">
          <UFormField label="Address" help="A preview is required before this address can be saved.">
            <UInput v-model="addressText" class="w-full" autocomplete="street-address" />
          </UFormField>
          <UButton
            label="Preview address"
            icon="i-lucide-search"
            variant="soft"
            :loading="pending"
            :disabled="!clientId || !addressText.trim()"
            @click="previewAddress"
          />

          <UFormField v-if="choices.length" label="Address preview">
            <USelectMenu
              v-model="selectedPlaceId"
              class="w-full"
              :items="choiceItems"
              value-key="value"
              placeholder="Choose the confirmed address"
            />
          </UFormField>

          <UAlert
            v-if="selectedChoice"
            color="info"
            variant="subtle"
            title="Selected address preview"
            :description="selectedChoice.formattedAddress"
          />

          <UFormField label="Location label">
            <UInput v-model="label" class="w-full" placeholder="Main showroom" />
          </UFormField>
        </div>

        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="modalOpen = false"
          />
          <UButton
            label="Confirm this location"
            icon="i-lucide-map-pin-check"
            :loading="pending"
            :disabled="!selectedChoice || !label.trim()"
            @click="confirmLocation"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
