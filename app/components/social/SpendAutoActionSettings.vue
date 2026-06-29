<script setup lang="ts">
type Mode = 'off' | 'notify' | 'propose'
const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const policy = ref<{ enabled: boolean; perSeverity: { critical: Mode; warning: Mode; info: Mode } }>({
  enabled: false,
  perSeverity: { critical: 'off', warning: 'off', info: 'off' },
})
const modeItems = [
  { label: 'Off', value: 'off' },
  { label: 'Notify only', value: 'notify' },
  { label: 'Auto-propose', value: 'propose' },
]

onMounted(async () => {
  try {
    const res = await $fetch('/api/agency/social/spend/auto-action-settings') as any
    policy.value = { enabled: Boolean(res?.enabled), perSeverity: { critical: res?.perSeverity?.critical ?? 'off', warning: res?.perSeverity?.warning ?? 'off', info: res?.perSeverity?.info ?? 'off' } }
  } catch { /* keep defaults */ } finally { loading.value = false }
})

async function save() {
  saving.value = true
  try {
    const res = await $fetch('/api/agency/social/spend/auto-action-settings', { method: 'PUT', body: policy.value }) as any
    if (res?.config) policy.value = { enabled: res.config.enabled, perSeverity: res.config.perSeverity }
    toast.add({ title: 'Saved', description: 'Spend automation policy updated.', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage || e?.message || 'Error', color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <div class="rounded-xl border border-default p-4 space-y-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-bot" class="text-primary" />
        <span class="text-sm font-medium">Spend automation</span>
      </div>
      <USwitch v-model="policy.enabled" :disabled="loading || saving" />
    </div>
    <p class="text-xs text-muted">
      On each pacing signal, act per severity. <b>Auto-propose</b> queues a budget adjustment for an admin to approve &amp; apply — it never changes a platform budget on its own.
    </p>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <UFormField label="Critical">
        <USelect
          v-model="policy.perSeverity.critical"
          :items="modeItems"
          :disabled="loading || saving || !policy.enabled"
          class="w-full min-w-40"
        />
      </UFormField>
      <UFormField label="Warning">
        <USelect
          v-model="policy.perSeverity.warning"
          :items="modeItems"
          :disabled="loading || saving || !policy.enabled"
          class="w-full min-w-40"
        />
      </UFormField>
      <UFormField label="Info">
        <USelect
          v-model="policy.perSeverity.info"
          :items="modeItems"
          :disabled="loading || saving || !policy.enabled"
          class="w-full min-w-40"
        />
      </UFormField>
    </div>
    <div class="flex justify-end">
      <UButton size="xs" :loading="saving" :disabled="loading" @click="save">Save</UButton>
    </div>
  </div>
</template>
