<script setup lang="ts">
import type { GoogleAiMaxCampaignDetail } from '~/types'
import {
  aiMaxMigrationReasonLabel,
  aiMaxReadinessLabel,
  aiMaxReadinessTone,
  aiMaxRiskLabel,
  aiMaxSearchMatchingLabel,
  aiMaxToggleLabel
} from '~/utils/googleAiMax'

defineProps<{
  detail: GoogleAiMaxCampaignDetail | null
  loading?: boolean
  error?: string | null
}>()

const open = defineModel<boolean>('open', { default: false })

function formatTime(value: string | null) {
  if (!value) return 'Not recorded'
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date(value))
}

function eventLabel(value: string) {
  return value.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}
</script>

<template>
  <USlideover v-model:open="open" title="AI Max campaign evidence" :ui="{ content: 'sm:max-w-2xl' }">
    <template #content>
      <div class="flex h-full flex-col">
        <header class="flex items-start justify-between gap-4 border-b border-default px-5 py-4">
          <div class="min-w-0">
            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              Google AI Max evidence
            </p>
            <h2 class="mt-1 truncate text-lg font-semibold">
              {{ detail?.campaignName || 'Campaign details' }}
            </h2>
            <p v-if="detail" class="mt-1 text-xs text-muted">
              {{ detail.client?.name || 'Unmapped client' }} · {{ detail.accountName || detail.customerId }}
            </p>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            aria-label="Close campaign evidence"
            @click="open = false"
          />
        </header>

        <div v-if="loading" class="flex flex-1 items-center justify-center gap-2 text-sm text-muted" role="status">
          <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
          Loading Google evidence…
        </div>
        <div v-else-if="error" class="p-5">
          <UAlert color="error" title="Campaign evidence unavailable" :description="error" />
        </div>
        <div v-else-if="detail" class="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section>
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :color="aiMaxReadinessTone(detail.readinessStatus)" variant="soft">
                {{ aiMaxReadinessLabel(detail.readinessStatus) }}
              </UBadge>
              <UBadge color="neutral" variant="subtle">
                {{ aiMaxMigrationReasonLabel(detail.migrationReason) }}
              </UBadge>
            </div>
            <p class="mt-3 text-sm leading-6 text-muted">
              XeroFlow derived this status from Google Ads API evidence. Review the controls below before the 1 September 2026 migration cutoff; this screen cannot change campaign settings.
            </p>
          </section>

          <section>
            <h3 class="text-sm font-semibold">
              Current Google evidence
            </h3>
            <dl class="mt-3 divide-y divide-default rounded-lg border border-default">
              <div class="flex items-start justify-between gap-4 px-3 py-2.5">
                <dt class="text-xs text-muted">
                  AI Max
                </dt><dd class="text-xs font-medium">
                  {{ detail.aiMaxEnabled == null ? 'Unknown' : detail.aiMaxEnabled ? 'Enabled' : 'Disabled' }}
                </dd>
              </div>
              <div class="flex items-start justify-between gap-4 px-3 py-2.5">
                <dt class="text-xs text-muted">
                  Search-term matching
                </dt><dd class="text-xs font-medium">
                  {{ aiMaxSearchMatchingLabel(detail.effectiveSettings.searchTermMatching) }}
                </dd>
              </div>
              <div class="flex items-start justify-between gap-4 px-3 py-2.5">
                <dt class="text-xs text-muted">
                  Text customisation
                </dt><dd class="text-xs font-medium">
                  {{ aiMaxToggleLabel(detail.effectiveSettings.textCustomisation) }}
                </dd>
              </div>
              <div class="flex items-start justify-between gap-4 px-3 py-2.5">
                <dt class="text-xs text-muted">
                  Final URL expansion
                </dt><dd class="text-xs font-medium">
                  {{ aiMaxToggleLabel(detail.effectiveSettings.finalUrlExpansion) }}
                </dd>
              </div>
              <div class="flex items-start justify-between gap-4 px-3 py-2.5">
                <dt class="text-xs text-muted">
                  Keyword match type
                </dt><dd class="text-xs font-medium">
                  {{ detail.keywordMatchType || 'Unknown' }}
                </dd>
              </div>
              <div class="flex items-start justify-between gap-4 px-3 py-2.5">
                <dt class="text-xs text-muted">
                  Bidding strategy
                </dt><dd class="text-xs font-medium">
                  {{ detail.biddingStrategyType || 'Unknown' }}
                </dd>
              </div>
              <div class="flex items-start justify-between gap-4 px-3 py-2.5">
                <dt class="text-xs text-muted">
                  Ad-group exceptions
                </dt><dd class="text-right text-xs font-medium">
                  {{ detail.adGroups.searchTermMatchingDisabled ?? 'Unknown' }} of {{ detail.adGroups.total ?? 'unknown' }} disable matching
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 class="text-sm font-semibold">
              Control risks
            </h3>
            <div v-if="detail.risks.length" class="mt-3 space-y-2">
              <div v-for="risk in detail.risks" :key="risk" class="flex items-start gap-2 rounded-lg border border-default px-3 py-2.5">
                <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0 text-warning" />
                <p class="text-xs">
                  {{ aiMaxRiskLabel(risk) }}
                </p>
              </div>
            </div>
            <p v-else class="mt-2 text-xs text-muted">
              No deterministic control risks were found in the latest evidence.
            </p>
          </section>

          <section>
            <h3 class="text-sm font-semibold">
              Material change history
            </h3>
            <div v-if="detail.timeline.length" class="mt-3 space-y-3 border-l border-default pl-4">
              <div v-for="event in detail.timeline" :key="event.id" class="relative">
                <span class="absolute -left-[19px] top-1.5 size-2 rounded-full bg-primary" />
                <p class="text-xs font-medium">
                  {{ eventLabel(event.eventType) }}
                </p>
                <p class="mt-0.5 text-[11px] text-muted">
                  {{ formatTime(event.observedAt) }}
                </p>
              </div>
            </div>
            <p v-else class="mt-2 text-xs text-muted">
              No material changes have been recorded after the first observation.
            </p>
          </section>

          <section>
            <h3 class="text-sm font-semibold">
              Raw evidence
            </h3>
            <pre class="mt-3 max-h-64 overflow-auto rounded-lg bg-elevated p-3 text-[11px] leading-5 text-muted">{{ JSON.stringify(detail.rawEvidence, null, 2) }}</pre>
          </section>
        </div>

        <footer v-if="detail" class="flex justify-end gap-2 border-t border-default px-5 py-3">
          <UButton color="neutral" variant="ghost" @click="open = false">
            Close
          </UButton>
          <UButton
            v-if="detail.deepLink"
            :to="detail.deepLink"
            target="_blank"
            rel="noopener noreferrer"
            trailing-icon="i-lucide-external-link"
          >
            Open in Google Ads
          </UButton>
        </footer>
      </div>
    </template>
  </USlideover>
</template>
