<script setup lang="ts">
import type { PageStudioShell } from '~~/shared/pageStudio/document'

defineProps<{ shell: PageStudioShell }>()
</script>

<template>
  <footer class="border-t border-default bg-neutral-950 px-6 py-10 text-white sm:px-10">
    <div class="mx-auto max-w-6xl">
      <div class="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div class="max-w-sm">
          <p class="font-semibold">
            {{ shell.siteName }}
          </p>
          <UButton
            v-if="shell.footerPresetId === 'conversion' && shell.primaryActionLabel"
            class="mt-5"
            :label="shell.primaryActionLabel"
            color="neutral"
            variant="solid"
            @click.prevent
          />
        </div>
        <div v-if="shell.footerPresetId !== 'compact'" class="grid grid-cols-2 gap-8 sm:grid-cols-3">
          <div v-for="group in shell.footerGroups" :key="group.id">
            <p class="text-sm font-semibold">
              {{ group.title }}
            </p>
            <div class="mt-3 space-y-2">
              <a
                v-for="link in group.links"
                :key="link.id"
                :href="link.href"
                class="block text-sm text-white/65"
                @click.prevent
              >{{ link.label }}</a>
            </div>
          </div>
        </div>
      </div>
      <p class="mt-9 border-t border-white/15 pt-5 text-xs text-white/55">
        {{ shell.copyright }}
      </p>
    </div>
  </footer>
</template>
