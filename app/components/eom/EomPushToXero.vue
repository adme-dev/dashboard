<script setup lang="ts">
import type { EomRun } from '~/types'

const props = defineProps<{
  run: EomRun
  contacts: { matched: any[]; unmatched: string[]; total: number } | null
  xeroStatus: { invoices: any[]; summary: { draft: number; authorised: number; paid: number; total: number } } | null
}>()

const emit = defineEmits<{
  validate: []
  push: []
  'check-status': []
  archive: []
}>()

const canPush = computed(() => {
  return props.run.status === 'review' && props.contacts && props.contacts.unmatched.length === 0
})
</script>

<template>
  <div class="space-y-6">
    <!-- Pre-push: Contact Validation -->
    <div v-if="run.status === 'review'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">Contact Validation</h3>
        <UButton variant="soft" size="sm" icon="i-lucide-refresh-cw" @click="emit('validate')">
          Re-validate
        </UButton>
      </div>

      <div v-if="contacts" class="space-y-3">
        <div class="flex gap-4 text-sm">
          <span class="text-success">{{ contacts.matched.length }} matched</span>
          <span :class="contacts.unmatched.length > 0 ? 'text-error font-medium' : 'text-muted'">
            {{ contacts.unmatched.length }} unmatched
          </span>
          <span class="text-muted">{{ contacts.total }} total</span>
        </div>

        <div v-if="contacts.unmatched.length > 0" class="border border-error/30 rounded-lg p-3 bg-error/5">
          <p class="text-sm font-medium text-error mb-2">Unmatched contacts must be resolved before pushing:</p>
          <ul class="list-disc list-inside text-sm space-y-1">
            <li v-for="name in contacts.unmatched" :key="name">{{ name }}</li>
          </ul>
        </div>
      </div>
      <div v-else class="text-sm text-muted">
        Validating contacts...
        <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin inline ml-1" />
      </div>

      <!-- Push Button -->
      <div class="border border-default rounded-lg p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-semibold">Push to Xero as DRAFT</p>
            <p class="text-sm text-muted">{{ run.invoiceCount }} invoices, {{ Math.ceil(run.invoiceCount / 50) }} batch{{ Math.ceil(run.invoiceCount / 50) > 1 ? 'es' : '' }}</p>
          </div>
          <UButton color="primary" :disabled="!canPush" icon="i-lucide-upload" @click="emit('push')">
            Push to Xero
          </UButton>
        </div>
      </div>
    </div>

    <!-- Post-push: Status Tracking -->
    <div v-if="['pushed', 'complete'].includes(run.status)" class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">Xero Invoice Status</h3>
        <UButton variant="soft" size="sm" icon="i-lucide-refresh-cw" @click="emit('check-status')">
          Refresh Status
        </UButton>
      </div>

      <div v-if="xeroStatus" class="space-y-3">
        <div class="grid grid-cols-4 gap-3">
          <div class="border border-default rounded-lg p-3 text-center">
            <p class="text-xs text-muted">Draft</p>
            <p class="text-xl font-bold">{{ xeroStatus.summary.draft }}</p>
          </div>
          <div class="border border-default rounded-lg p-3 text-center">
            <p class="text-xs text-muted">Authorised</p>
            <p class="text-xl font-bold text-success">{{ xeroStatus.summary.authorised }}</p>
          </div>
          <div class="border border-default rounded-lg p-3 text-center">
            <p class="text-xs text-muted">Paid</p>
            <p class="text-xl font-bold text-primary">{{ xeroStatus.summary.paid }}</p>
          </div>
          <div class="border border-default rounded-lg p-3 text-center">
            <p class="text-xs text-muted">Total</p>
            <p class="text-xl font-bold">{{ xeroStatus.summary.total }}</p>
          </div>
        </div>
      </div>
      <div v-else class="text-sm text-muted">
        Loading Xero status...
        <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin inline ml-1" />
      </div>

      <!-- Archive -->
      <div v-if="run.status === 'pushed'" class="border border-default rounded-lg p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-semibold">Archive & Complete</p>
            <p class="text-sm text-muted">Archive CSV and mark this run as complete</p>
          </div>
          <UButton variant="soft" color="success" icon="i-lucide-archive" @click="emit('archive')">
            Archive
          </UButton>
        </div>
      </div>
    </div>

    <!-- Xero link -->
    <div class="text-sm text-muted">
      <a href="https://go.xero.com/AccountsReceivable/Search.aspx?invoiceStatus=DRAFT" target="_blank" class="text-primary hover:underline inline-flex items-center gap-1">
        Open Xero Draft Invoices
        <UIcon name="i-lucide-external-link" class="w-3 h-3" />
      </a>
    </div>
  </div>
</template>
