<script setup lang="ts">
definePageMeta({ layout: 'agency' })

const PRESETS = [
  { label: 'Client portal', value: 'https://app.xeroflow.io/portal' },
  { label: 'Agency dashboard', value: 'https://app.xeroflow.io/agency' },
]
</script>

<template>
  <div class="flex-1 min-h-0 overflow-y-auto">
    <div class="mx-auto w-full max-w-4xl space-y-6 p-6">
      <header class="space-y-0.5">
        <h1 class="text-2xl font-semibold tracking-tight">QR codes</h1>
        <p class="text-sm text-muted">Generate a QR code for any link or text — encoded locally, download as PNG or SVG.</p>
      </header>
      <ToolsQrGenerator :presets="PRESETS" />
    </div>
  </div>
</template>
