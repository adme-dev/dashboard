<script setup lang="ts">
defineProps<{ title: string, description?: string, wide?: boolean }>()
</script>

<template>
  <div class="min-h-screen bg-default text-default">
    <header class="border-b border-default">
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
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
    <main class="mx-auto px-5 py-10 sm:px-8 sm:py-16" :class="wide ? 'max-w-5xl' : 'max-w-xl'">
      <slot name="eyebrow" />
      <h1 class="text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
        {{ title }}
      </h1>
      <p v-if="description" class="mt-3 leading-7 text-muted">
        {{ description }}
      </p>
      <div class="mt-8">
        <slot />
      </div>
    </main>
  </div>
</template>
