<script setup lang="ts">
const colorMode = useColorMode()
const dark = computed(() => colorMode.value === 'dark')

function toggleTheme() {
  colorMode.preference = dark.value ? 'light' : 'dark'
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
