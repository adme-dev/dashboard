<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const toast = useToast()
const token = ref('')
const ready = ref(false)
const loading = ref(false)
const error = ref('')

onMounted(() => {
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  const legacyQueryToken = typeof route.query.token === 'string' ? route.query.token : ''
  token.value = fragment.get('token') || legacyQueryToken
  window.history.replaceState(null, '', window.location.pathname)
  ready.value = true
})

function errorMessage(caught: unknown) {
  if (caught && typeof caught === 'object' && 'data' in caught) {
    return (caught as { data?: { statusMessage?: string } }).data?.statusMessage
  }
  return undefined
}

async function handleAccept() {
  if (!token.value) return
  error.value = ''
  loading.value = true

  try {
    const data = await $fetch<{ success: boolean, redirect: string }>(
      '/api/portal/auth/accept-invite',
      { method: 'POST', body: { token: token.value } }
    )
    toast.add({
      title: 'Portal access activated',
      description: 'You are securely signed in.',
      color: 'success'
    })
    await navigateTo(data.redirect)
  } catch (caught: unknown) {
    error.value = errorMessage(caught) || 'This invitation could not be activated. Request a new link from your account manager.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e] flex items-center justify-center px-6 py-16">
    <main class="w-full max-w-[420px]">
      <div class="mb-8 text-center">
        <div class="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[#b7bfd9]/[0.09] dark:bg-white/[0.06]">
          <UIcon name="i-lucide-mail-check" class="size-7 text-[#121317] dark:text-white" />
        </div>
        <p class="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[#45474D]/60 dark:text-white/40">
          Secure invitation
        </p>
        <h1 class="text-[28px] font-[450] tracking-[-0.02em] text-[#121317] dark:text-white">
          Your portal is ready
        </h1>
        <p class="mt-3 text-[15px] leading-6 text-[#45474D] dark:text-white/60">
          Continue to activate your client access and open the workspace. No setup or passphrase is required.
        </p>
      </div>

      <div v-if="!ready" class="flex justify-center py-4">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-[#45474D]/50 dark:text-white/40" />
      </div>

      <UAlert
        v-else-if="!token"
        title="Invitation link incomplete"
        description="Open the complete link from your invitation email, or ask your account manager to send a new one."
        color="error"
        icon="i-lucide-link-2-off"
      />

      <div v-else class="space-y-4">
        <UAlert
          v-if="error"
          :title="error"
          color="error"
          icon="i-lucide-alert-circle"
        />

        <UButton
          block
          size="xl"
          color="neutral"
          icon="i-lucide-arrow-right"
          trailing
          :loading="loading"
          :disabled="loading"
          @click="handleAccept"
        >
          Continue to portal
        </UButton>

        <p class="text-center text-xs leading-5 text-[#45474D]/60 dark:text-white/40">
          This action verifies the invitation and starts a secure client session.
        </p>
      </div>
    </main>
  </div>
</template>
