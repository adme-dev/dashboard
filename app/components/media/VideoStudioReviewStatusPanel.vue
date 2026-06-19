<script setup lang="ts">
withDefaults(defineProps<{
  renderJobCount?: number
  latestRenderStatus?: string | null
}>(), {
  renderJobCount: 0,
  latestRenderStatus: null,
})
</script>

<template>
  <section class="rounded-md border border-default bg-default/30 p-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-list-checks" class="size-4 text-muted" />
          <h4 class="text-xs font-medium uppercase text-muted">Review workflow</h4>
        </div>
        <p class="mt-1 text-xs leading-snug text-muted">
          Reserve client approval, comments, and final handoff around the rendered outputs.
        </p>
      </div>
      <UBadge label="Reserved" size="xs" variant="subtle" color="neutral" />
    </div>

    <div class="mt-3 grid grid-cols-2 gap-2">
      <div class="rounded-md border border-default bg-elevated px-2 py-1.5">
        <p class="text-[11px] uppercase text-muted">Approval state</p>
        <p class="mt-0.5 text-xs font-medium text-highlighted">Draft review</p>
      </div>
      <div class="rounded-md border border-default bg-elevated px-2 py-1.5">
        <p class="text-[11px] uppercase text-muted">Render queue</p>
        <p class="mt-0.5 text-xs font-medium text-highlighted">{{ renderJobCount }} {{ renderJobCount === 1 ? 'job' : 'jobs' }}</p>
      </div>
      <div class="rounded-md border border-default bg-elevated px-2 py-1.5">
        <p class="text-[11px] uppercase text-muted">Comments</p>
        <p class="mt-0.5 text-xs font-medium text-highlighted">Reserved</p>
      </div>
      <div class="rounded-md border border-default bg-elevated px-2 py-1.5">
        <p class="text-[11px] uppercase text-muted">Latest render</p>
        <p class="mt-0.5 text-xs font-medium text-highlighted">{{ latestRenderStatus || 'Not rendered' }}</p>
      </div>
    </div>

    <p class="mt-2 text-[11px] leading-snug text-muted">
      Full approval comments and client sign-off can attach here after the render and portal handoff contracts are finalized.
    </p>
  </section>
</template>
