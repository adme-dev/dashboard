<script setup lang="ts">
defineProps<{ title: string, description?: string, wide?: boolean, compact?: boolean }>()
</script>

<template>
  <div class="min-h-screen bg-default text-default">
    <header class="border-b border-default">
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8" :class="compact ? 'flex-wrap' : undefined">
        <NuxtLink :to="wide ? '/studio/dashboard' : '/studio/signup'" class="flex items-center gap-2 font-semibold text-highlighted">
          <UIcon name="i-lucide-panels-top-left" class="size-5 text-primary" />Page Studio
        </NuxtLink>
        <slot name="header">
          <UButton
            to="/support"
            label="Get help"
            color="neutral"
            variant="ghost"
          />
        </slot>
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
