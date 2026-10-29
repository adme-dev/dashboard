<script setup lang="ts">
import { resolveBannerTheme, bannerThemeCookie, bannerThemeCookieOptions } from '~/utils/banner-theme'

const preference = useCookie(bannerThemeCookie, bannerThemeCookieOptions)
const colorMode = useColorMode()
const route = useRoute()
const dark = computed(() => resolveBannerTheme(preference.value) === 'dark')
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
    size="sm"
    class="shrink-0"
    @click="toggleTheme"
  />
</template>
