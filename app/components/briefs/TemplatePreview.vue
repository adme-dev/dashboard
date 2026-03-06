<script setup lang="ts">
import type { BriefTemplate } from '~/types'

defineProps<{
  template: BriefTemplate
}>()
</script>

<template>
  <div class="p-6 space-y-4">
    <!-- Template header -->
    <div class="flex items-center gap-3 pb-4 border-b border-default">
      <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
        <UIcon :name="template.icon || 'i-lucide-file-text'" class="size-5 text-primary" />
      </div>
      <div>
        <h2 class="text-lg font-semibold text-highlighted">{{ template.name }}</h2>
        <p v-if="template.description" class="text-sm text-muted">{{ template.description }}</p>
      </div>
    </div>

    <!-- Settings summary -->
    <div class="flex flex-wrap gap-2">
      <UBadge v-if="template.isMultiStep" variant="subtle">Multi-step</UBadge>
      <UBadge v-if="template.requiresApproval" variant="subtle" color="warning">Requires Approval</UBadge>
      <UBadge v-if="template.isPublic" variant="subtle" color="success">Public</UBadge>
      <UBadge v-if="template.allowAttachments" variant="subtle">Attachments</UBadge>
      <UBadge variant="subtle">{{ template.defaultPriority }} priority</UBadge>
    </div>

    <!-- Form preview -->
    <div class="border border-default rounded-lg p-4 bg-elevated/30">
      <BriefsBriefFormRenderer
        :template="template"
        disabled
      />
    </div>

    <p class="text-xs text-muted text-center">
      This is a preview. Fields are disabled and cannot be submitted.
    </p>
  </div>
</template>
