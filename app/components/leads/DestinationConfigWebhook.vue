<script setup lang="ts">
const config = defineModel<Record<string, any>>('config', { default: () => ({}) })

const headersJson = ref<string>(JSON.stringify(config.value.headers ?? {}, null, 2))

watch(headersJson, (v) => {
  try {
    config.value.headers = JSON.parse(v)
  } catch {
    // let server-side validate
  }
})
</script>

<template>
  <div class="space-y-3">
    <div class="space-y-1">
      <label class="text-xs text-muted">URL (HTTPS only)</label>
      <UInput v-model="config.url" placeholder="https://acme.example.com/leads" />
    </div>
    <div class="space-y-1">
      <label class="text-xs text-muted">Method</label>
      <USelectMenu
        v-model="config.method"
        :items="[{ value: 'POST', label: 'POST' }, { value: 'PUT', label: 'PUT' }]"
        value-key="value"
      />
    </div>
    <div class="space-y-1">
      <label class="text-xs text-muted">Signing secret (optional)</label>
      <UInput v-model="config.secret" type="password" placeholder="optional — adds X-Leads-Signature" />
    </div>
    <div class="space-y-1">
      <label class="text-xs text-muted">Extra headers (JSON)</label>
      <UTextarea v-model="headersJson" :rows="5" class="ring-1 ring-default rounded font-mono text-xs" />
    </div>
  </div>
</template>
