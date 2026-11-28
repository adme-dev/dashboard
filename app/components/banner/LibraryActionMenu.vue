<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{ items: () => DropdownMenuItem[][], label: string, icon: string }>()
const activated = ref(false)
</script>

<template>
  <UDropdownMenu v-if="activated" :items="items()" default-open>
    <UButton :icon="icon" :aria-label="label" size="xs" color="neutral" variant="ghost" />
  </UDropdownMenu>
  <UButton
    v-else
    :icon="icon"
    :aria-label="label"
    size="xs"
    color="neutral"
    variant="ghost"
    aria-haspopup="menu"
    aria-expanded="false"
    @click="activated = true"
    @keydown.down.prevent="activated = true"
  />
</template>
