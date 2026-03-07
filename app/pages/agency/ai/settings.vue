<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

const { preferences, fetchPreferences, savePreferences } = useAiAgent()
const saving = ref(false)

const timezoneOptions = [
  { label: 'Australia/Melbourne (AEST)', value: 'Australia/Melbourne' },
  { label: 'Australia/Sydney (AEST)', value: 'Australia/Sydney' },
  { label: 'Australia/Brisbane (AEST)', value: 'Australia/Brisbane' },
  { label: 'Australia/Perth (AWST)', value: 'Australia/Perth' },
  { label: 'Australia/Adelaide (ACST)', value: 'Australia/Adelaide' },
  { label: 'Pacific/Auckland (NZST)', value: 'Pacific/Auckland' },
  { label: 'America/New_York (EST)', value: 'America/New_York' },
  { label: 'America/Chicago (CST)', value: 'America/Chicago' },
  { label: 'America/Denver (MST)', value: 'America/Denver' },
  { label: 'America/Los_Angeles (PST)', value: 'America/Los_Angeles' },
  { label: 'Europe/London (GMT)', value: 'Europe/London' },
  { label: 'Europe/Berlin (CET)', value: 'Europe/Berlin' },
  { label: 'Europe/Paris (CET)', value: 'Europe/Paris' },
  { label: 'Asia/Tokyo (JST)', value: 'Asia/Tokyo' },
  { label: 'Asia/Singapore (SGT)', value: 'Asia/Singapore' },
]

const focusAreas = [
  { key: 'tasks', label: 'Tasks', description: 'Overdue, blocked, and stalled tasks' },
  { key: 'briefs', label: 'Briefs', description: 'Brief status changes and pipeline health' },
  { key: 'financial', label: 'Financial', description: 'Revenue, margins, and cash flow' },
  { key: 'team', label: 'Team', description: 'Workload balance and capacity' },
  { key: 'ad_spend', label: 'Ad Spend', description: 'Budget pacing and campaign alerts' },
  { key: 'eom', label: 'EOM', description: 'End-of-month invoice generation status' },
]

function toggleFocus(key: string) {
  const idx = preferences.value.reportFocus.indexOf(key)
  if (idx >= 0) {
    preferences.value.reportFocus.splice(idx, 1)
  } else {
    preferences.value.reportFocus.push(key)
  }
}

async function handleSave() {
  saving.value = true
  await savePreferences()
  saving.value = false
}

onMounted(() => {
  fetchPreferences()
})
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="AI Agent Settings" />

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <div class="max-w-2xl mx-auto space-y-8">
          <!-- Digest Schedule -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-calendar" class="w-5 h-5 text-[var(--ui-text-muted)]" />
                <h2 class="font-semibold text-[var(--ui-text-highlighted)]">Digest Schedule</h2>
              </div>
            </template>
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="font-medium text-[var(--ui-text-highlighted)]">Daily Digest</p>
                  <p class="text-sm text-[var(--ui-text-muted)]">Get a summary of tasks, deadlines, and alerts each morning</p>
                </div>
                <UCheckbox v-model="preferences.dailyDigest" />
              </div>
              <div class="flex items-center justify-between">
                <div>
                  <p class="font-medium text-[var(--ui-text-highlighted)]">Weekly Report</p>
                  <p class="text-sm text-[var(--ui-text-muted)]">Comprehensive weekly overview with trends and recommendations</p>
                </div>
                <UCheckbox v-model="preferences.weeklyReport" />
              </div>
              <div class="flex items-center justify-between">
                <div>
                  <p class="font-medium text-[var(--ui-text-highlighted)]">Anomaly Alerts</p>
                  <p class="text-sm text-[var(--ui-text-muted)]">Get notified when unusual patterns are detected</p>
                </div>
                <UCheckbox v-model="preferences.anomalyAlerts" />
              </div>
            </div>
          </UCard>

          <!-- Delivery Time -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-clock" class="w-5 h-5 text-[var(--ui-text-muted)]" />
                <h2 class="font-semibold text-[var(--ui-text-highlighted)]">Delivery Time</h2>
              </div>
            </template>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-[var(--ui-text)] mb-1.5">Digest Time</label>
                <UInput
                  v-model="preferences.digestTime"
                  type="time"
                  class="w-48"
                />
                <p class="text-xs text-[var(--ui-text-muted)] mt-1">When to deliver your daily digest</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-[var(--ui-text)] mb-1.5">Timezone</label>
                <USelect
                  v-model="preferences.timezone"
                  :items="timezoneOptions"
                  value-key="value"
                  class="w-full"
                />
              </div>
            </div>
          </UCard>

          <!-- Focus Areas -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-target" class="w-5 h-5 text-[var(--ui-text-muted)]" />
                <h2 class="font-semibold text-[var(--ui-text-highlighted)]">Focus Areas</h2>
              </div>
              <p class="text-sm text-[var(--ui-text-muted)] mt-1">Select which areas the AI agent should analyze and report on</p>
            </template>
            <div class="space-y-3">
              <div
                v-for="area in focusAreas"
                :key="area.key"
                class="flex items-center justify-between p-3 rounded-lg border border-[var(--ui-border)] hover:bg-[var(--ui-bg-elevated)] transition-colors"
              >
                <div>
                  <p class="font-medium text-[var(--ui-text-highlighted)]">{{ area.label }}</p>
                  <p class="text-sm text-[var(--ui-text-muted)]">{{ area.description }}</p>
                </div>
                <UCheckbox
                  :model-value="preferences.reportFocus.includes(area.key)"
                  @update:model-value="toggleFocus(area.key)"
                />
              </div>
            </div>
          </UCard>

          <!-- Save -->
          <div class="flex justify-end">
            <UButton
              color="primary"
              label="Save Settings"
              icon="i-lucide-save"
              :loading="saving"
              @click="handleSave"
            />
          </div>
        </div>
      </div>
    </UDashboardPanel>
  </div>
</template>
