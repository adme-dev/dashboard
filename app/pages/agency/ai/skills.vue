<script setup lang="ts">
import type { RoleSkillAdminList, RoleSkillList } from '~~/shared/types/roleSkills'

definePageMeta({ layout: 'agency' })
const { data: catalog, error, refresh } = await useFetch<RoleSkillList>('/api/agency/ai/skills')
const management = ref<RoleSkillAdminList | null>(null)
const managementError = ref(false)
if (catalog.value?.canManage) {
  try {
    management.value = await $fetch<RoleSkillAdminList>('/api/admin/ai/skills')
  } catch {
    managementError.value = true
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
    <div class="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-highlighted">
            Skills and sources
          </h1>
          <p class="mt-1 text-sm text-muted">
            Review the published workflows attached to your role and the references behind them.
          </p>
        </div>
        <div class="flex gap-2">
          <UButton to="/agency/ai/my-assistant" variant="ghost" color="neutral">
            My Assistant
          </UButton>
          <UButton
            to="/agency/ai/chat"
            icon="i-lucide-message-square"
            variant="outline"
            color="neutral"
          >
            Open chat
          </UButton>
        </div>
      </header>
      <UAlert
        v-if="error"
        color="error"
        title="Could not load skills"
        description="Try again to retrieve your current role's published skills."
      />
      <UButton
        v-if="error"
        variant="outline"
        color="neutral"
        @click="refresh()"
      >
        Try again
      </UButton>
      <UAlert
        v-if="managementError"
        color="warning"
        title="Management view unavailable"
        description="Your published skills are shown below. Reload to retry management access."
      />
      <AiRoleSkillsManager
        v-if="catalog"
        :catalog="catalog"
        :management="management"
        @published="refresh()"
      />
    </div>
  </div>
</template>
