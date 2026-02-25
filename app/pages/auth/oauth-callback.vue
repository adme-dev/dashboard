<script setup lang="ts">
/**
 * OAuth popup callback page.
 * Receives result query params, posts them to the opener window, and auto-closes.
 */
definePageMeta({ layout: false })

const route = useRoute()
const hasOpener = ref(false)

const result = computed(() => ({
  type: 'oauth_result',
  platform: route.query.platform as string || 'unknown',
  success: route.query.success === 'true',
  accounts: parseInt(String(route.query.accounts || '0'), 10),
  error: route.query.error as string || null,
}))

const platformName = computed(() => {
  const p = result.value.platform
  if (p === 'meta') return 'Meta Ads'
  if (p === 'google') return 'Google Ads'
  return p
})

onMounted(() => {
  hasOpener.value = !!window.opener
  // Send result to opener window
  if (window.opener) {
    window.opener.postMessage(result.value, window.location.origin)
    // Auto-close after a short delay to ensure message is sent
    setTimeout(() => window.close(), 800)
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-default">
    <div class="text-center space-y-3 p-8 max-w-sm">
      <template v-if="result.success">
        <div class="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center mx-auto">
          <UIcon name="i-lucide-check" class="w-7 h-7 text-success" />
        </div>
        <p class="text-base font-semibold">{{ platformName }} connected</p>
        <p class="text-sm text-muted">
          {{ result.accounts }} ad account{{ result.accounts !== 1 ? 's' : '' }} linked successfully.
        </p>
        <p v-if="hasOpener" class="text-xs text-muted">This window will close automatically...</p>
      </template>
      <template v-else>
        <div class="w-14 h-14 rounded-full bg-error/10 flex items-center justify-center mx-auto">
          <UIcon name="i-lucide-x" class="w-7 h-7 text-error" />
        </div>
        <p class="text-base font-semibold">Connection failed</p>
        <p class="text-sm text-muted">{{ result.error || 'Something went wrong. Please try again.' }}</p>
        <p v-if="hasOpener" class="text-xs text-muted">This window will close automatically...</p>
      </template>
      <UButton v-if="!hasOpener" to="/agency/social" variant="soft" size="sm" class="mt-4">
        Back to Connections
      </UButton>
    </div>
  </div>
</template>
