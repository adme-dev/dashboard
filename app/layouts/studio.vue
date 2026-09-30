<script setup lang="ts">
const { user, logout } = usePortalAuth()
const signingOut = ref(false)
async function signOut() {
  if (signingOut.value) return
  signingOut.value = true
  try {
    await logout('/studio')
  } finally {
    signingOut.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-default text-default">
    <header class="border-b border-default">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <NuxtLink to="/studio/sites" class="flex items-center gap-2 font-semibold text-highlighted">
          <UIcon name="i-lucide-panels-top-left" class="size-5 text-primary" />
          Page Studio
        </NuxtLink>
        <nav aria-label="Page Studio" class="flex items-center gap-2">
          <UButton
            to="/studio/sites"
            label="My sites"
            color="neutral"
            variant="ghost"
          />
          <span v-if="user?.clientName" class="hidden max-w-48 truncate px-2 text-sm text-muted sm:block">{{ user.clientName }}</span>
          <UButton
            label="Sign out"
            color="neutral"
            variant="ghost"
            :loading="signingOut"
            @click="signOut"
          />
        </nav>
      </div>
    </header>
    <main class="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <slot />
    </main>
  </div>
</template>
