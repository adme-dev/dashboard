<script setup lang="ts">
import {
  SOCIAL_SUITE_SECTIONS,
  socialSuiteItemForPath
} from '~/utils/socialSuiteNavigation'

const route = useRoute()
const active = computed(() => socialSuiteItemForPath(route.path))
</script>

<template>
  <div class="border-y border-default py-3">
    <div class="mb-3">
      <div class="text-xs font-medium uppercase text-muted">
        Social suite
      </div>
      <p v-if="active" class="mt-1 text-xs text-muted">
        {{ active.section.label }}:
        {{ active.item.objective }}
      </p>
    </div>

    <div class="flex flex-wrap gap-x-5 gap-y-3">
      <div
        v-for="section in SOCIAL_SUITE_SECTIONS"
        :key="section.key"
        class="flex flex-wrap items-center gap-1.5"
      >
        <span class="mr-0.5 text-[11px] font-medium uppercase text-muted">
          {{ section.label }}
        </span>
        <UTooltip
          v-for="item in section.items"
          :key="item.to"
          :text="item.objective"
        >
          <UButton
            :to="item.to"
            :icon="item.icon"
            size="xs"
            :color="active?.item.to === item.to ? 'primary' : 'neutral'"
            :variant="active?.item.to === item.to ? 'subtle' : 'ghost'"
          >
            {{ item.label }}
          </UButton>
        </UTooltip>
      </div>
    </div>
  </div>
</template>
