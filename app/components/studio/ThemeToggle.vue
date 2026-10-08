<script setup lang="ts">
import { resolveStudioTheme, studioThemeCookie, studioThemeCookieOptions } from '~/utils/studioTheme'

const preference = useCookie(studioThemeCookie, studioThemeCookieOptions)
const colorMode = useColorMode()
const route = useRoute()
const dark = computed(() => resolveStudioTheme(preference.value) === 'dark')
function toggleTheme() {
  const next = dark.value ? 'light' : 'dark'
  preference.value = next
  route.meta.colorMode = next
  colorMode.value = next
}
</script>

<template>
  <UButton
    :icon="dark ? 'i-lucide-sun' : 'i-lucide-moon'"
    :aria-label="dark ? 'Switch to light mode' : 'Switch to dark mode'"
    :title="dark ? 'Switch to light mode' : 'Switch to dark mode'"
    color="neutral"
    variant="ghost"
    class="shrink-0 rounded-none"
    @click="toggleTheme"
  />
</template>
