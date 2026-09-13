<script setup lang="ts">
const emit = defineEmits<{ created: [] }>()
const { user } = usePortalAuth()
const canCreate = computed(() => ['admin', 'manager'].includes(user.value?.role ?? ''))
const open = ref(false)
const saving = ref(false)
const message = ref<string | null>(null)
const form = reactive({ name: '', route: '', starterVersion: 'limousine-v1', setupSource: 'template', setupBrief: '' })
const starters = [
  { label: 'Limousine and tours', value: 'limousine-v1' },
  { label: 'Floristry', value: 'floristry-v1' },
  { label: 'Retail', value: 'retail-v1' },
  { label: 'IT goods', value: 'it-goods-v1' },
  { label: 'Import and export', value: 'import-export-v1' }
]
const sources = [{ label: 'Start with a template', value: 'template' }, { label: 'Describe my website', value: 'chat' }]

async function save() {
  if (!canCreate.value || saving.value) return
  message.value = null
  const route = form.route.trim().toLowerCase()
  if (!form.name.trim() || !/^[a-z0-9](?:[a-z0-9-]{0,62})$/.test(route)) {
    message.value = 'Enter a website name and a route using letters, numbers and hyphens.'
    return
  }
  if (form.setupSource === 'chat' && !form.setupBrief.trim()) {
    message.value = 'Describe the website you want to create.'
    return
  }
  saving.value = true
  try {
    const result = await $fetch<{ site: { id: string } }>('/api/portal/page-studio/sites', {
      method: 'POST',
      body: { ...form, name: form.name.trim(), route, setupBrief: form.setupSource === 'chat' ? form.setupBrief.trim() : '' }
    })
    open.value = false
    form.name = ''
    form.route = ''
    form.setupBrief = ''
    emit('created')
    await navigateTo(`/portal/page-studio/${result.site.id}/setup`)
  } catch {
    message.value = 'The website could not be created. Refresh your websites to check whether it was saved. If it is missing, check your subscription allowance and the site route before trying again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UButton
    v-if="canCreate"
    label="New website"
    icon="i-lucide-plus"
    @click="message = null; open = true"
  />
  <UModal
    v-model:open="open"
    title="Create your website"
    description="Choose a starter and prepare your website setup for review."
    :dismissible="!saving"
    scrollable
  >
    <template #body>
      <div class="grid grid-cols-1 gap-4">
        <UAlert
          v-if="message"
          color="error"
          title="Website could not be created"
          :description="message"
        />
        <UFormField label="Website name" required>
          <UInput
            v-model="form.name"
            class="w-full"
            maxlength="160"
            :disabled="saving"
          />
        </UFormField>
        <UFormField label="Site route" help="Use letters, numbers and hyphens. Connect a custom domain later." required>
          <UInput
            v-model="form.route"
            class="w-full"
            maxlength="63"
            :disabled="saving"
          />
        </UFormField>
        <UFormField label="Business template" required>
          <USelectMenu
            v-model="form.starterVersion"
            :items="starters"
            value-key="value"
            class="w-full"
            :disabled="saving"
          />
        </UFormField>
        <UFormField label="How would you like to start?" required>
          <USelectMenu
            v-model="form.setupSource"
            :items="sources"
            value-key="value"
            class="w-full"
            :disabled="saving"
          />
        </UFormField>
        <UFormField
          v-if="form.setupSource === 'chat'"
          label="Website brief"
          help="Describe your services, pages and customer forms. Business details will need confirmation before publishing."
          required
        >
          <UTextarea
            v-model="form.setupBrief"
            class="w-full"
            :rows="6"
            maxlength="4000"
            :disabled="saving"
          />
        </UFormField>
        <p class="text-sm leading-6 text-muted">
          Your subscription must allow another website and the selected features. Your setup proposal will be saved for review before infrastructure setup and publishing.
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="saving"
          @click="open = false"
        />
        <UButton
          label="Create website draft"
          :loading="saving"
          :disabled="!canCreate"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
