<script setup lang="ts">
import {
  SOCIAL_PUBLISHING_OBJECTIVE,
  socialPublishingRouteGroups,
  socialPublishingRouteForPath,
  socialPublishingStepForPath
} from '~/utils/socialPublishingNavigation'

const route = useRoute()
const routeGroups = socialPublishingRouteGroups()
const activeRoute = computed(() => socialPublishingRouteForPath(route.path))
const activeStep = computed(() => socialPublishingStepForPath(route.path))
</script>

<template>
  <div class="mb-6 border-y border-default py-3">
    <div class="flex flex-col gap-3">
      <div>
        <div class="text-xs font-medium uppercase text-muted">
          Publishing objective
        </div>
        <p class="mt-1 text-sm text-default">
          {{ SOCIAL_PUBLISHING_OBJECTIVE }}
        </p>
        <p v-if="activeStep" class="mt-1 text-xs text-muted">
          Step {{ activeStep.position }} of {{ activeStep.total }}:
          {{ activeStep.item.objective }}
        </p>
      </div>

      <div class="flex flex-wrap gap-x-5 gap-y-3">
        <div
          v-for="group in routeGroups"
          :key="group.key"
          class="flex flex-wrap items-center gap-1.5"
        >
          <span class="mr-0.5 text-[11px] font-medium uppercase text-muted">
            {{ group.label }}
          </span>
          <UTooltip
            v-for="item in group.items"
            :key="item.key"
            :text="item.objective"
          >
            <UButton
              :to="item.to"
              :icon="item.icon"
              size="xs"
              :color="activeRoute?.key === item.key ? 'primary' : 'neutral'"
              :variant="activeRoute?.key === item.key ? 'subtle' : 'ghost'"
            >
              {{ item.label }}
            </UButton>
          </UTooltip>
        </div>
      </div>
    </div>
  </div>
</template>
