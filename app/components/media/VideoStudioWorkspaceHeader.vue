<script setup lang="ts">
withDefaults(defineProps<{
  projectCount?: number
  pending?: boolean
  active?: 'studio' | 'projects' | 'library'
}>(), {
  projectCount: 0,
  pending: false,
  active: 'studio'
})

const emit = defineEmits<{
  (event: 'create'): void
}>()

const navigation = [
  { id: 'studio' as const, label: 'Studio', icon: 'i-lucide-clapperboard', to: '/agency/audio/projects?mediaType=av' },
  { id: 'projects' as const, label: 'Projects', icon: 'i-lucide-folder-open', to: '/agency/audio/projects' },
  { id: 'library' as const, label: 'Audio library', icon: 'i-lucide-library', to: '/agency/audio' }
]
</script>

<template>
  <header class="border-b border-default pb-6">
    <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
      <div class="flex min-w-0 items-start gap-3.5">
        <div class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <UIcon name="i-lucide-clapperboard" class="size-5" />
        </div>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 class="text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
              Video Studio
            </h1>
            <span class="text-sm text-muted" role="status">
              {{ pending ? 'Loading projects' : `${projectCount} ${projectCount === 1 ? 'project' : 'projects'}` }}
            </span>
          </div>
          <p class="mt-1.5 max-w-2xl text-sm leading-6 text-muted">
            Bring footage, sound, and story together in one focused video workspace.
          </p>
        </div>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <nav class="flex items-center gap-1 rounded-lg border border-default bg-elevated/40 p-1" aria-label="Media workspace">
          <UButton
            v-for="item in navigation"
            :key="item.id"
            :to="item.to"
            :icon="item.icon"
            :label="item.label"
            :aria-current="active === item.id ? 'page' : undefined"
            :color="active === item.id ? 'primary' : 'neutral'"
            :variant="active === item.id ? 'soft' : 'ghost'"
            size="sm"
            class="flex-1 justify-center sm:flex-none"
          />
        </nav>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          label="New video project"
          class="w-full justify-center sm:w-auto"
          @click="emit('create')"
        />
      </div>
    </div>
  </header>
</template>
