<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'created'): void }>()

const toast = useToast()

// Client picker — never empty-string values (use the client id).
const { data: clientsData } = await useFetch<any>('/api/agency/clients')
const clientItems = computed(() => {
  const list = Array.isArray(clientsData.value) ? clientsData.value : (clientsData.value?.clients ?? [])
  return list
    .filter((c: any) => c.isActive !== false)
    .map((c: any) => ({ label: c.name, value: c.id }))
})

const CONSENT_MODES = [
  { label: 'Off — capture all (AU opt-out)', value: 'off' },
  { label: 'AU opt-out (essential granted)', value: 'au_optout' },
  { label: 'Consent-gated (opt-in)', value: 'consent_gated' }
]

const form = reactive({
  clientId: '' as string,
  name: '',
  originsText: '',
  spa: false,
  consentMode: 'off',
  retentionDays: 395
})

const submitting = ref(false)

function reset() {
  form.clientId = ''
  form.name = ''
  form.originsText = ''
  form.spa = false
  form.consentMode = 'off'
  form.retentionDays = 395
}

const canSubmit = computed(() => !!form.clientId && form.name.trim().length > 0)

async function submit() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  try {
    const allowedOrigins = form.originsText
      .split(/[\n,]/)
      .map(s => s.trim())
      .filter(Boolean)
    await $fetch('/api/agency/tracking', {
      method: 'POST',
      body: {
        clientId: form.clientId,
        name: form.name.trim(),
        allowedOrigins,
        spa: form.spa,
        consentMode: form.consentMode,
        retentionDays: Number(form.retentionDays) || 395
      }
    })
    toast.add({ title: 'Tracking site created', color: 'success' })
    reset()
    open.value = false
    emit('created')
  } catch (err: any) {
    toast.add({
      title: 'Could not create site',
      description: err?.data?.statusMessage || err?.message || 'Unknown error',
      color: 'error'
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <USlideover v-model:open="open" title="New tracking site">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Client" required>
          <USelectMenu
            v-model="form.clientId"
            :items="clientItems"
            value-key="value"
            placeholder="Select a client"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Site name" required help="e.g. “GWS Kia” — shown in the sites list.">
          <UInput v-model="form.name" placeholder="GWS Kia" class="w-full" />
        </UFormField>

        <UFormField
          label="Allowed origins"
          help="One per line or comma-separated. Leave blank to allow any origin (soft mode)."
        >
          <UTextarea
            v-model="form.originsText"
            :rows="3"
            placeholder="https://www.kia.gws.com.au"
            class="w-full"
          />
        </UFormField>

        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Consent mode">
            <USelect
              v-model="form.consentMode"
              :items="CONSENT_MODES"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Retention (days)">
            <UInput
              v-model.number="form.retentionDays"
              type="number"
              min="1"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField label="Single-page app (SPA)" help="Enable for Gatsby/Next.js sites so route changes fire page_view.">
          <UCheckbox v-model="form.spa" label="This site is a SPA" />
        </UFormField>
      </div>
    </template>

    <template #footer="{ close }">
      <div class="flex items-center justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="close"
        />
        <UButton
          color="primary"
          label="Create site"
          icon="i-lucide-plus"
          :loading="submitting"
          :disabled="!canSubmit"
          @click="submit"
        />
      </div>
    </template>
  </USlideover>
</template>
