<template>
  <div class="flex flex-col items-center justify-center h-full text-center px-6">
    <div class="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-3">
      <UIcon name="i-lucide-inbox" class="w-6 h-6 text-muted" />
    </div>
    <p class="text-sm font-medium text-highlighted">Incoming Tasks</p>
    <p class="text-xs text-muted mt-1">Tasks assigned to you and pending actions will appear here.</p>
    <UBadge label="Coming soon" color="neutral" variant="subtle" size="xs" class="mt-3" />
  </div>
</template>
