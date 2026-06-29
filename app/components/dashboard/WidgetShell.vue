<script setup lang="ts">
/**
 * Shared dashboard-widget shell. Gives every list widget a consistent, bounded layout:
 * a header (icon + title + count "outline" badges), a capped body (the widget supplies
 * the already-sliced rows), and a footer ("+N more" + "View all →"). Capping the rows is
 * what keeps card heights uniform — no unbounded growth, no nested scrollbars.
 *
 * Usage:
 *   <DashboardWidgetShell
 *     title="Blocked Tasks" icon="i-lucide-octagon-alert"
 *     :badges="[{ label: `${blocked} blocked`, color: 'error' }]"
 *     :loading="status === 'pending'" :is-empty="!rows.length"
 *     :more-count="total - rows.length" to="/agency/workflow">
 *     <div v-for="row in rows" ... />
 *   </DashboardWidgetShell>
 */

interface WidgetBadge {
  label: string | number
  color?: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
}

withDefaults(defineProps<{
  title: string
  icon?: string
  badges?: WidgetBadge[]
  /** "View all" link target. */
  to?: string
  viewAllLabel?: string
  /** Hidden-row count → renders "+N more". */
  moreCount?: number
  loading?: boolean
  isEmpty?: boolean
  emptyText?: string
  emptyIcon?: string
  /** Skeleton row count while loading. */
  skeletonRows?: number
}>(), {
  viewAllLabel: 'View all',
  moreCount: 0,
  loading: false,
  isEmpty: false,
  emptyText: 'Nothing to show',
  emptyIcon: 'i-lucide-inbox',
  skeletonRows: 4,
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <UIcon v-if="icon" :name="icon" class="w-4 h-4 text-[var(--ui-text-muted)] shrink-0" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)] truncate">{{ title }}</h3>
          <div v-if="badges?.length" class="flex items-center gap-1 shrink-0">
            <UBadge
              v-for="(b, i) in badges"
              :key="i"
              :color="b.color || 'neutral'"
              variant="subtle"
              size="xs"
            >
              {{ b.label }}
            </UBadge>
          </div>
        </div>
        <slot name="header-actions" />
      </div>
    </template>

    <!-- Loading -->
    <div v-if="loading" class="space-y-2">
      <slot name="loading">
        <USkeleton v-for="i in skeletonRows" :key="i" class="h-9 w-full rounded" />
      </slot>
    </div>

    <!-- Empty -->
    <div v-else-if="isEmpty" class="text-center py-6 text-[var(--ui-text-muted)]">
      <slot name="empty">
        <UIcon :name="emptyIcon" class="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p class="text-sm">{{ emptyText }}</p>
      </slot>
    </div>

    <!-- Body + footer -->
    <template v-else>
      <slot />

      <div
        v-if="moreCount > 0 || to"
        class="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[var(--ui-border)]"
      >
        <span v-if="moreCount > 0" class="text-xs text-[var(--ui-text-muted)]">
          +{{ moreCount }} more
        </span>
        <span v-else />
        <NuxtLink
          v-if="to"
          :to="to"
          class="text-xs font-medium text-[var(--ui-text-toned)] hover:text-[var(--ui-text-highlighted)] inline-flex items-center gap-1"
        >
          {{ viewAllLabel }}
          <UIcon name="i-lucide-arrow-right" class="w-3 h-3" />
        </NuxtLink>
      </div>
    </template>
  </UCard>
</template>
