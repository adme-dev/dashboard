<script setup lang="ts">
const config = defineModel<Record<string, any>>('config', { default: () => ({}) })
</script>

<template>
  <div class="space-y-3">
    <div class="space-y-1">
      <label class="text-xs text-muted">Slack incoming webhook URL</label>
      <UInput v-model="config.webhook_url" placeholder="https://hooks.slack.com/services/T0/B0/xxx" />
    </div>
    <div class="space-y-1">
      <label class="text-xs text-muted">Mention (optional, e.g. @here or &lt;@U123&gt;)</label>
      <UInput v-model="config.mention" placeholder="@here" />
    </div>
  </div>
</template>
