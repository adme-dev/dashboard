<!-- app/pages/agency/email/compose.vue -->
<script setup lang="ts">
definePageMeta({ layout: 'agency' })
const embeddedFigflow = useRoute().query.workspace === 'figflow'
if (embeddedFigflow) setPageLayout(false)
useHead({ title: 'Compose — Email Marketing' })
</script>

<template>
  <div :class="embeddedFigflow ? 'h-svh' : 'h-[calc(100vh-4rem)]'" class="min-h-0 flex flex-col">
    <header class="px-6 py-3 border-b border-default flex items-center justify-between">
      <h1 class="text-lg font-semibold">
        Compose email
      </h1>
      <UButton
        v-if="embeddedFigflow"
        to="/agency/email?tab=templates&amp;workspace=figflow"
        label="Email templates"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
      />
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
