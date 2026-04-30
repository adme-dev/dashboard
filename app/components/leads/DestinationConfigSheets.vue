<script setup lang="ts">
const config = defineModel<Record<string, any>>('config', { default: () => ({}) })
</script>

<template>
  <div class="space-y-3">
    <UAlert
      icon="i-lucide-info"
      title="Requires the Google connection to include the spreadsheets scope"
      description="If your Google connection was set up for ad spend only, you may need to reconnect with the sheets scope."
      color="info"
      variant="soft"
    />
    <div class="space-y-1">
      <label class="text-xs text-muted">Spreadsheet ID</label>
      <UInput v-model="config.spreadsheet_id" placeholder="44-char Google Sheet ID" />
    </div>
    <div class="space-y-1">
      <label class="text-xs text-muted">Sheet name (tab)</label>
      <UInput v-model="config.sheet_name" placeholder="Sheet1" />
    </div>
  </div>
</template>
