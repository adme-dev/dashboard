<script setup lang="ts">
defineProps<{ review: any }>()
const config = (value: unknown) => value == null ? 'None' : JSON.stringify(value, null, 2)
</script>

<template>
  <div class="@container space-y-4 text-sm">
    <UAlert
      v-if="!review || review.unavailable"
      color="warning"
      title="Exact review unavailable"
      :description="review?.unavailable || 'Prepare a new proposal before approving.'"
    />
    <template v-else>
      <h3 class="text-base font-semibold">
        {{ review.action === 'rollback' ? 'Restore a previous version' : review.action === 'publish' ? 'Replace the live version' : review.action === 'installation' ? 'Compile the tracking installation' : 'Proposed changes' }}
      </h3>
      <dl class="grid grid-cols-1 @lg:grid-cols-2 gap-4">
        <div>
          <dt class="text-muted">
            Current live base
          </dt>
          <dd class="break-all">
            {{ review.base?.path }}
          </dd>
          <dd class="break-all text-muted">
            Fingerprint: {{ review.base?.fingerprint }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Exact target version
          </dt>
          <dd class="break-all">
            {{ review.target?.path || 'Created during execution; separate publication review required' }}
          </dd>
          <dd v-if="review.target" class="break-all text-muted">
            Fingerprint: {{ review.target.fingerprint }}
          </dd>
        </div>
      </dl>
      <div v-if="review.sourceProposalId" class="space-y-1">
        <p class="text-muted">
          Source proposal
        </p>
        <UButton variant="link" :to="review.sourceProposalHref" class="break-all">
          {{ review.sourceProposalId }}
        </UButton>
      </div>
      <div v-if="review.installation" class="space-y-1">
        <p>Site: {{ review.installation.siteName }}</p>
        <p class="break-all">
          Collector: {{ review.installation.collectorOrigin }}
        </p>
        <p>Single-page navigation: {{ review.installation.spa ? 'Enabled' : 'Disabled' }}</p>
        <p class="break-all text-muted">
          Installation identity: {{ review.installationHash }}
        </p>
        <p class="text-muted">
          The server-generated script and write key are represented by content hashes below.
        </p>
      </div>
      <p v-if="!review.changes?.length" class="text-muted">
        No entity configuration differences in this replacement.
      </p>
      <section v-for="(change, index) in review.changes" :key="index" class="space-y-2">
        <h4 class="font-medium">
          {{ change.action }} · {{ change.name || change.after?.name || change.body?.name || change.kind || 'Container binding' }}
        </h4>
        <div class="grid grid-cols-1 @lg:grid-cols-2 gap-3">
          <div>
            <p class="mb-1 text-muted">
              Before
            </p><pre class="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-elevated p-3 text-xs">{{ config(change.before) }}</pre>
          </div>
          <div>
            <p class="mb-1 text-muted">
              After
            </p><pre class="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-elevated p-3 text-xs">{{ config(change.after) }}</pre>
          </div>
        </div>
      </section>
      <details v-if="review.target">
        <summary class="cursor-pointer font-medium">
          Complete version replacement configuration
        </summary>
        <pre class="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded bg-elevated p-3 text-xs">{{ config({ before: review.base.configuration, after: review.target.configuration }) }}</pre>
      </details>
      <p class="text-muted">
        Validation: {{ review.validation }}
      </p>
      <p class="text-muted">
        Cost impact: {{ review.cost }}
      </p>
    </template>
  </div>
</template>
