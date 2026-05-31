<!-- app/pages/agency/email/compose.vue -->
<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useHead({ title: 'Compose — Email Marketing' })
</script>

<template>
  <div class="h-[calc(100vh-4rem)] flex flex-col">
    <header class="px-6 py-3 border-b border-default flex items-center justify-between">
      <h1 class="text-lg font-semibold">
        Compose email
      </h1>
    </header>
    <div class="flex-1 overflow-hidden">
      <ClientOnly>
        <EmailBuilderEdmFlyhubBuilder />
        <template #fallback>
          <div class="p-6 text-sm text-muted">
            Loading editor…
          </div>
        </template>
      </ClientOnly>
    </div>
  </div>
</template>
