<script setup lang="ts">
definePageMeta({ layout: false })
const route = useRoute()
const templateId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
useHead({ title: 'Email design — FigFlow' })
</script>

<template>
  <ClientOnly>
    <EmailWorkspaceFigflowEmailWorkspace v-if="templateId" :key="templateId" :template-id="templateId" />
    <template #fallback>
      <p class="p-6 text-sm text-muted">Opening the saved email design…</p>
    </template>
  </ClientOnly>
</template>
