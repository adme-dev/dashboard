<template>
  <div class="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
    <UIcon name="i-lucide-badge-check" class="text-success mb-2" size="48" />
    <h1 class="text-lg font-semibold">Xero connection updated</h1>
    <p class="text-sm text-muted">
      You can close this window. We&apos;ll refresh your dashboard automatically.
    </p>
  </div>
</template>

<script setup lang="ts">
if (process.client) {
  if (window.opener) {
    window.opener.postMessage({ type: 'xero-connected' }, '*')
    setTimeout(() => window.close(), 500)
  } else {
    setTimeout(() => navigateTo('/settings'), 1200)
  }
}
</script>

