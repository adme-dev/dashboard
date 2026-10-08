<script setup lang="ts">
defineProps<{ title: string, description?: string, wide?: boolean, compact?: boolean }>()
</script>

<template>
  <div class="min-h-screen bg-default text-default">
    <header class="border-b border-default">
      <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <StudioBrand :to="wide ? '/studio/dashboard' : '/studio/signup'" />
        <div class="flex flex-wrap items-center gap-2">
          <StudioThemeToggle />
          <slot name="header">
            <UButton
              to="/support"
              label="Get help"
              color="neutral"
              variant="ghost"
            />
          </slot>
        </div>
      </div>
    </header>
    <main class="mx-auto px-5 sm:px-8" :class="[wide ? 'max-w-5xl' : 'max-w-xl', compact ? 'py-6 sm:py-8' : 'py-10 sm:py-16']">
      <slot name="eyebrow" />
      <h1 class="font-semibold tracking-tight text-highlighted" :class="compact ? 'text-2xl' : 'text-3xl sm:text-4xl'">
        {{ title }}
      </h1>
      <p v-if="description" class="text-muted" :class="compact ? 'mt-2 text-sm leading-6' : 'mt-3 leading-7'">
        {{ description }}
      </p>
      <div class="mt-8">
        <slot />
      </div>
    </main>
  </div>
</template>
