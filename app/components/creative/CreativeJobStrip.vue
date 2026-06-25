<script setup lang="ts">
import { computed } from 'vue'
import type { CreativeJobItem, CreativeJobSummary, CreativeJobStatus } from '~~/app/utils/creative/jobSummary'

const props = defineProps<{
  summary: CreativeJobSummary
}>()

const activeJobs = computed(() => props.summary.items.filter(item => item.status === 'queued' || item.status === 'running').slice(0, 3))
const attentionJobs = computed(() => props.summary.items.filter(item => item.status === 'failed' || item.status === 'blocked').slice(0, 3))
const completedJobs = computed(() => props.summary.items.filter(item => item.status === 'ready').slice(0, 3))

function badgeColor(status: CreativeJobStatus): 'primary' | 'success' | 'error' | 'warning' | 'neutral' {
  if (status === 'ready') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'blocked') return 'warning'
  if (status === 'queued' || status === 'running') return 'primary'
  return 'neutral'
}

function kindIcon(kind: CreativeJobItem['kind']) {
  if (kind === 'audio') return 'i-lucide-audio-lines'
  if (kind === 'generation') return 'i-lucide-sparkles'
  return 'i-lucide-clapperboard'
}
</script>

<template>
  <section class="rounded-md border border-default bg-elevated px-3 py-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex min-w-0 items-center gap-2">
        <UIcon name="i-lucide-list-checks" class="size-4 shrink-0 text-muted" />
        <div class="min-w-0">
          <p class="text-xs font-medium text-highlighted">
            Creative jobs
          </p>
          <p class="truncate text-[11px] text-muted">
            <span v-if="summary.counts.total">
              {{ summary.counts.active }} active · {{ summary.counts.attention }} need attention · {{ summary.counts.completed }} completed
            </span>
            <span v-else>No creative jobs</span>
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <UBadge
          :label="`${summary.counts.active} active`"
          size="xs"
          variant="subtle"
          color="primary"
        />
        <UBadge
          :label="`${summary.counts.attention} need attention`"
          size="xs"
          variant="subtle"
          color="error"
        />
        <UBadge
          :label="`${summary.counts.completed} completed`"
          size="xs"
          variant="subtle"
          color="success"
        />
      </div>
    </div>

    <div
      v-if="summary.counts.total"
      class="mt-2 grid gap-2 md:grid-cols-3"
    >
      <div class="min-w-0">
        <p class="mb-1 text-[11px] font-medium uppercase text-muted">
          Active
        </p>
        <div class="space-y-1">
          <div
            v-for="item in activeJobs"
            :key="item.id"
            class="flex min-w-0 items-center gap-1.5 rounded border border-default bg-default/30 px-2 py-1"
          >
            <UIcon :name="kindIcon(item.kind)" class="size-3.5 shrink-0 text-muted" />
            <span class="truncate text-[11px] text-highlighted">{{ item.label }}</span>
            <UBadge
              :label="item.status"
              size="xs"
              variant="subtle"
              :color="badgeColor(item.status)"
            />
          </div>
          <p v-if="!activeJobs.length" class="text-[11px] text-muted">
            None
          </p>
        </div>
      </div>

      <div class="min-w-0">
        <p class="mb-1 text-[11px] font-medium uppercase text-muted">
          Attention
        </p>
        <div class="space-y-1">
          <div
            v-for="item in attentionJobs"
            :key="item.id"
            class="min-w-0 rounded border border-error/30 bg-error/5 px-2 py-1"
          >
            <div class="flex min-w-0 items-center gap-1.5">
              <UIcon :name="kindIcon(item.kind)" class="size-3.5 shrink-0 text-error" />
              <span class="truncate text-[11px] font-medium text-highlighted">{{ item.label }}</span>
              <UBadge
                :label="item.status"
                size="xs"
                variant="subtle"
                :color="badgeColor(item.status)"
              />
            </div>
            <p v-if="item.error" class="mt-0.5 truncate text-[11px] text-error">
              {{ item.error }}
            </p>
          </div>
          <p v-if="!attentionJobs.length" class="text-[11px] text-muted">
            None
          </p>
        </div>
      </div>

      <div class="min-w-0">
        <p class="mb-1 text-[11px] font-medium uppercase text-muted">
          Completed
        </p>
        <div class="space-y-1">
          <div
            v-for="item in completedJobs"
            :key="item.id"
            class="flex min-w-0 items-center gap-1.5 rounded border border-default bg-default/30 px-2 py-1"
          >
            <UIcon :name="kindIcon(item.kind)" class="size-3.5 shrink-0 text-muted" />
            <span class="truncate text-[11px] text-highlighted">{{ item.label }}</span>
            <UBadge
              :label="item.status"
              size="xs"
              variant="subtle"
              :color="badgeColor(item.status)"
            />
          </div>
          <p v-if="!completedJobs.length" class="text-[11px] text-muted">
            None
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
