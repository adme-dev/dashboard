<script setup lang="ts">
const { user, logout } = usePortalAuth()
const signingOut = ref(false)
const unsavedFormSettings = useState<boolean>('studio-unsaved-form-settings', () => false)
async function signOut() {
  if (signingOut.value || unsavedFormSettings.value) return
  signingOut.value = true
  try {
    await logout('/studio')
  } finally {
    signingOut.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh bg-default text-default xl:pr-[18%]">
    <header class="border-b border-default">
      <div class="flex min-h-24 flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-10">
        <StudioBrand to="/studio/sites" />
        <nav aria-label="Page Studio" class="flex flex-wrap items-center gap-1 sm:gap-2">
          <UButton
            to="/studio/sites"
            label="My sites"
            color="neutral"
            variant="ghost"
          />
          <UButton
            to="/studio/credits"
            label="Image credits"
            color="neutral"
            variant="ghost"
          />
          <span v-if="user?.clientName" class="hidden max-w-48 truncate px-2 text-sm text-muted sm:block">{{ user.clientName }}</span>
          <StudioThemeToggle />
          <UButton
            label="Sign out"
            color="neutral"
            variant="ghost"
            :loading="signingOut"
            :disabled="unsavedFormSettings"
            @click="signOut"
          />
        </nav>
      </div>
    </header>
    <main class="mx-auto w-full max-w-[1440px] px-6 py-10 sm:px-10 sm:py-14">
      <slot />
    </main>
    <StudioArtPanel class="fixed inset-y-2 right-2 hidden w-[calc(18%-8px)] xl:block" />
  </div>
</template>
