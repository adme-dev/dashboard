<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { data, pending } = useFetch<{ enabled: boolean }>('/api/portal/qr-enabled', { default: () => ({ enabled: false }) })
</script>

<template>
  <div class="mx-auto w-full max-w-4xl space-y-6 p-6">
    <header class="space-y-0.5">
      <h1 class="text-2xl font-semibold tracking-tight">QR codes</h1>
      <p class="text-sm text-muted">Generate a QR code for any link or text — encoded in your browser.</p>
    </header>

    <USkeleton v-if="pending" class="h-48 w-full" />
    <ToolsQrGenerator v-else-if="data?.enabled" />
    <UAlert
      v-else
      color="neutral"
      variant="subtle"
      icon="i-lucide-qr-code"
      title="QR codes aren't enabled for your portal yet"
      description="Ask your account manager to switch this on."
    />
  </div>
</template>
