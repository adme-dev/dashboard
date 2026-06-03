<script setup lang="ts">
import {
  PORTAL_SOCIAL_OBJECTIVE,
  PORTAL_SOCIAL_ROUTE_ORDER,
  portalSocialRouteForPath,
  portalSocialStepForPath
} from '~/utils/portalSocialNavigation'

const route = useRoute()
const activeRoute = computed(() => portalSocialRouteForPath(route.path))
const activeStep = computed(() => portalSocialStepForPath(route.path))
</script>

<template>
  <div class="border-y border-default py-3">
    <div class="flex flex-col gap-3">
      <div>
        <div class="text-xs font-medium uppercase text-muted">
          Portal social objective
        </div>
        <p class="mt-1 text-sm text-default">
          {{ PORTAL_SOCIAL_OBJECTIVE }}
        </p>
        <p v-if="activeStep" class="mt-1 text-xs text-muted">
          Step {{ activeStep.position }} of {{ activeStep.total }}:
          {{ activeStep.item.objective }}
        </p>
      </div>

      <div class="flex flex-wrap gap-x-5 gap-y-3">
        <div
          v-for="item in PORTAL_SOCIAL_ROUTE_ORDER"
          :key="item.key"
          class="flex flex-wrap items-center gap-1.5"
        >
          <span class="mr-0.5 text-[11px] font-medium uppercase text-muted">
            {{ item.section }}
          </span>
          <UTooltip :text="item.objective">
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
