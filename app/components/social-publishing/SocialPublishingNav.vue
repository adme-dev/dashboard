<script setup lang="ts">
import {
  socialPublishingRouteGroups,
  socialPublishingRouteForPath,
  type SocialPublishingNavCountKey
} from '~/utils/socialPublishingNavigation'

/**
 * Tile nav for the Social Publishing suite. Presentational: the active tile is
 * derived from the current route, and live count badges come in via `counts`
 * (the shell fetches /api/agency/social/publishing/nav-counts and passes them).
 * Grouped Create → Schedule → Review → Connect → Measure.
 */
const props = defineProps<{
  counts?: Partial<Record<SocialPublishingNavCountKey, number>> | null
}>()

const route = useRoute()
const groups = socialPublishingRouteGroups()
const activeKey = computed(() => socialPublishingRouteForPath(route.path)?.key)

function badgeFor(badgeKey?: SocialPublishingNavCountKey): number {
  if (!badgeKey || !props.counts) return 0
  return props.counts[badgeKey] ?? 0
}
</script>

<template>
  <nav class="border-b border-default pb-4 mb-6">
    <div class="flex flex-wrap items-start gap-x-6 gap-y-3">
      <div v-for="group in groups" :key="group.key" class="flex flex-col gap-1.5">
        <span class="text-[11px] font-medium uppercase tracking-wide text-muted">
          {{ group.label }}
        </span>
        <div class="flex flex-wrap items-center gap-1.5">
          <UTooltip v-for="item in group.items" :key="item.key" :text="item.objective">
            <UButton
              :to="item.to"
              :icon="item.icon"
              size="sm"
              :color="activeKey === item.key ? 'primary' : 'neutral'"
              :variant="activeKey === item.key ? 'subtle' : 'ghost'"
              :aria-current="activeKey === item.key ? 'page' : undefined"
            >
              {{ item.label }}
              <UBadge
                v-if="badgeFor(item.badgeKey) > 0"
                :color="item.badgeKey === 'pendingApprovals' ? 'warning' : 'neutral'"
                variant="solid"
                size="sm"
                class="ml-1"
              >
                {{ badgeFor(item.badgeKey) }}
              </UBadge>
            </UButton>
          </UTooltip>
        </div>
      </div>
    </div>
  </nav>
</template>
