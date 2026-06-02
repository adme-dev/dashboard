<script setup lang="ts">
const toast = useToast()

interface BudgetSlackConfig {
  webhook_url: string | null
  channel: string | null
  digest_enabled: boolean
  realtime_enabled: boolean
  digest_hour: number
  create_tasks: boolean
  task_assignee_id: string | null
}

const { data: cfg, refresh } = await useFetch<BudgetSlackConfig>('/api/agency/settings/budget-slack')
// team-members endpoint returns { members: [...] } — NOT a bare array
const { data: membersData } = await useFetch<{ members: Array<{ id: string; name: string }> }>('/api/agency/team-members')
const members = computed(() => membersData.value?.members ?? [])

const saving = ref(false)
const testing = ref(false)

const hourOptions = Array.from({ length: 24 }, (_, h) => ({
  label: `${String(h).padStart(2, '0')}:00`,
  value: h
}))

async function save() {
  saving.value = true
  try {
    await $fetch('/api/agency/settings/budget-slack', { method: 'PUT', body: cfg.value })
    toast.add({ title: 'Saved', description: 'Budget alert settings updated.', color: 'success' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Error', description: e?.data?.statusMessage ?? 'Could not save', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function sendTest() {
  testing.value = true
  try {
    await $fetch('/api/agency/settings/budget-slack/test', { method: 'POST' })
    toast.add({ title: 'Test sent', description: 'Check your Slack channel.', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Test failed', description: e?.data?.statusMessage ?? 'Could not post', color: 'error' })
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <div v-if="cfg" class="max-w-2xl space-y-8">
    <!-- Page heading -->
    <div>
      <h2 class="text-lg font-semibold">Budget Alerts &amp; Slack</h2>
      <p class="mt-1 text-sm text-gray-500">Detect ad-spend pacing issues and post reviews to Slack automatically.</p>
    </div>

    <!-- Section: Slack connection -->
    <div class="space-y-5">
      <div class="pb-2 border-b border-gray-100 dark:border-gray-800">
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">Slack connection</h3>
        <p class="mt-0.5 text-xs text-gray-500">Where budget alerts and digests are delivered.</p>
      </div>

      <UFormField
        label="Webhook URL"
        help="Create an Incoming Webhook in your Slack workspace and paste the https://hooks.slack.com/services/… URL here."
      >
        <UInput
          v-model="cfg.webhook_url"
          placeholder="https://hooks.slack.com/services/..."
          class="w-full font-mono text-sm"
        />
      </UFormField>

      <UFormField
        label="Channel override"
        help="Optional — leave blank to post to the webhook's default channel."
      >
        <UInput
          v-model="cfg.channel"
          placeholder="#budget-tracker"
          class="w-full"
        />
      </UFormField>
    </div>

    <!-- Section: Notification behaviour -->
    <div class="space-y-5">
      <div class="pb-2 border-b border-gray-100 dark:border-gray-800">
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">Notification behaviour</h3>
        <p class="mt-0.5 text-xs text-gray-500">Control what gets posted and when.</p>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Daily digest" help="Post a full budget review to Slack each morning.">
          <USwitch v-model="cfg.digest_enabled" />
        </UFormField>
        <UFormField label="Real-time critical alerts" help="Fire immediately when a campaign breaches a critical threshold.">
          <USwitch v-model="cfg.realtime_enabled" />
        </UFormField>
      </div>

      <UFormField label="Digest delivery hour" help="Hour of the day (tenant-local time) when the morning digest is sent.">
        <USelect
          v-model="cfg.digest_hour"
          :items="hourOptions"
          class="w-48"
        />
      </UFormField>
    </div>

    <!-- Section: Accountability tasks -->
    <div class="space-y-5">
      <div class="pb-2 border-b border-gray-100 dark:border-gray-800">
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">Accountability tasks</h3>
        <p class="mt-0.5 text-xs text-gray-500">Automatically create assigned tasks for critical budget issues so nothing slips through.</p>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <UFormField
          label="Auto-create tasks"
          help="Creates a due-in-24h task for each critical issue detected."
        >
          <USwitch v-model="cfg.create_tasks" />
        </UFormField>
        <UFormField
          label="Assign tasks to"
          help="Required when auto-create tasks is enabled."
        >
          <USelectMenu
            v-model="cfg.task_assignee_id"
            :items="members.map(m => ({ label: m.name, value: m.id }))"
            value-key="value"
            placeholder="Select a team member"
            class="w-full"
          />
        </UFormField>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-3 pt-2">
      <UButton :loading="saving" @click="save">
        Save settings
      </UButton>
      <UButton
        variant="ghost"
        :loading="testing"
        :disabled="!cfg.webhook_url"
        @click="sendTest"
      >
        Send test message
      </UButton>
    </div>
  </div>
</template>
