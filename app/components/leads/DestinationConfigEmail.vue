<script setup lang="ts">
const config = defineModel<Record<string, any>>('config', { default: () => ({ to: [] }) })

const toCsv = ref<string>((config.value.to ?? []).join(', '))

watch(toCsv, (v) => {
  config.value.to = v.split(',').map(s => s.trim()).filter(Boolean)
})
</script>

<template>
  <div class="space-y-3">
    <div class="space-y-1">
      <label class="text-xs text-muted">To (comma-separated)</label>
      <UInput v-model="toCsv" placeholder="ops@adme.net.au, james@adme.net.au" />
    </div>
    <div class="space-y-1">
      <label class="text-xs text-muted">Subject template</label>
      <UInput v-model="config.subject_template" placeholder="New lead from {{ field.first_name }}" />
    </div>
    <div class="space-y-1">
      <label class="text-xs text-muted">Body template (HTML)</label>
      <UTextarea v-model="config.body_template" :rows="8" class="ring-1 ring-default rounded font-mono text-xs" />
    </div>
    <div class="space-y-1">
      <label class="text-xs text-muted">From (optional)</label>
      <UInput v-model="config.from" placeholder="leads@adme.net.au" />
    </div>
  </div>
</template>
