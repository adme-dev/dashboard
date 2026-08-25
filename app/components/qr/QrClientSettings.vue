<script setup lang="ts">
/** Per-client QR settings popover — today just the client-360 export toggle. */
const props = defineProps<{ clientId: string }>()
const api = useQrCodes()
const toast = useToast()
const open = ref(false)
const loading = ref(false)
const saving = ref(false)
const export360 = ref(false)
const trackerInstalled = ref(false)

watch([open, () => props.clientId], async ([o]) => {
  if (!o) return
  loading.value = true
  try {
    const res = await api.settings(props.clientId)
    export360.value = res.settings.export360
    trackerInstalled.value = res.trackerInstalled
  } finally {
    loading.value = false
  }
})
async function toggle(v: boolean) {
  saving.value = true
  try {
    const res = await api.updateSettings({ clientId: props.clientId, export360: v })
    export360.value = res.settings.export360
    toast.add({ title: v ? 'Client 360 export on' : 'Client 360 export off', description: v ? 'Scans, landing views and leads now appear in this client\'s tracking stream.' : undefined, color: 'success' })
  } catch (e: any) {
    export360.value = !v
    toast.add({ title: 'Could not update', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UPopover v-model:open="open">
    <UButton
      icon="i-lucide-radar"
      variant="soft"
      color="neutral"
      aria-label="Client 360 export settings"
    >
      Client 360
    </UButton>
    <template #content>
      <div class="w-80 space-y-3 p-4">
        <div>
          <p class="text-sm font-medium">
            Client 360 export
          </p>
          <p class="mt-0.5 text-xs text-muted">
            Mirror every scan, landing view and lead into this client's first-party tracking stream, so QR sits beside site visits in their reports. Identity is the scan's daily IP hash and the GA4 client id the client's own tag already set — never a fingerprint.
          </p>
        </div>
        <USkeleton v-if="loading" class="h-6 w-24" />
        <USwitch
          v-else
          :model-value="export360"
          :disabled="saving"
          :label="export360 ? 'On' : 'Off'"
          @update:model-value="toggle"
        />
        <p v-if="!loading && !trackerInstalled" class="text-xs text-warning">
          No active tracking site for this client — events have nowhere to land until the tracker is set up.
        </p>
      </div>
    </template>
  </UPopover>
</template>
