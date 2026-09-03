<script setup lang="ts">
import type { PageStudioShell } from '~~/shared/pageStudio/document'

defineProps<{ device: 'desktop' | 'tablet' | 'mobile', shell: PageStudioShell }>()
</script>

<template>
  <header class="border-b border-default bg-default px-6 py-4 text-highlighted sm:px-10">
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-5">
      <p class="font-semibold tracking-tight">
        {{ shell.siteName }}
      </p>
      <nav v-if="device !== 'mobile' && shell.headerPresetId !== 'campaign'" class="ml-auto flex items-center gap-5" aria-label="Preview navigation">
        <a
          v-for="item in shell.navigation"
          :key="item.id"
          :href="item.href"
          class="text-sm text-muted"
          @click.prevent
        >{{ item.label }}</a>
      </nav>
      <UButton
        v-else-if="device === 'mobile' && shell.navigation.length"
        label="Menu"
        icon="i-lucide-menu"
        color="neutral"
        variant="ghost"
        size="sm"
        @click.prevent
      />
      <UButton
        v-if="shell.primaryActionLabel"
        :label="shell.primaryActionLabel"
        size="sm"
        @click.prevent
      />
    </div>
  </header>
</template>
