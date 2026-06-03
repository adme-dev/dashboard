<script setup lang="ts">
import {
  SOCIAL_SPEND_OBJECTIVE,
  SOCIAL_SPEND_PLATFORM_ROUTES,
  SOCIAL_SPEND_WORKFLOW_ROUTES,
  socialSpendRouteForPath,
  socialSpendStepForPath
} from '~/utils/socialSpendNavigation'

const route = useRoute()
const activeRoute = computed(() => socialSpendRouteForPath(route.path))
const activeStep = computed(() => socialSpendStepForPath(route.path))
</script>

<template>
  <div class="border-y border-default py-3">
    <div class="flex flex-col gap-3">
      <div>
        <div class="text-xs font-medium uppercase text-muted">
          Paid social objective
        </div>
        <p class="mt-1 text-sm text-default">
          {{ SOCIAL_SPEND_OBJECTIVE }}
        </p>
        <p v-if="activeStep" class="mt-1 text-xs text-muted">
          Step {{ activeStep.position }} of {{ activeStep.total }}:
          {{ activeStep.item.objective }}
        </p>
        <p v-else-if="activeRoute" class="mt-1 text-xs text-muted">
          {{ activeRoute.section }}:
          {{ activeRoute.objective }}
        </p>
      </div>

      <div class="flex flex-wrap gap-x-5 gap-y-3">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="mr-0.5 text-[11px] font-medium uppercase text-muted">
            Workflow
          </span>
          <UTooltip
            v-for="item in SOCIAL_SPEND_WORKFLOW_ROUTES"
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

        <div class="flex flex-wrap items-center gap-1.5">
          <span class="mr-0.5 text-[11px] font-medium uppercase text-muted">
            Platforms
          </span>
          <UTooltip
            v-for="item in SOCIAL_SPEND_PLATFORM_ROUTES"
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
