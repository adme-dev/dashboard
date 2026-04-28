<script setup lang="ts">
const toast = useToast()

const loading = ref(true)
const saving = ref(false)

const state = reactive<{ [key: string]: boolean }>({
  // Email notifications
  email_task_assigned: true,
  email_task_mentioned: true,
  email_task_due: true,
  email_approval_request: true,
  email_weekly_digest: false,
  email_board_member_added: true,
  email_brief_assigned: true,
  email_brief_status: true,
  email_brief_comment: true,
  // In-app notifications
  inapp_task_assigned: true,
  inapp_task_mentioned: true,
  inapp_task_status: true,
  inapp_task_comment: true,
  inapp_task_due: true,
  inapp_approval: true,
  inapp_board_member_added: true,
  inapp_brief_assigned: true,
  inapp_brief_status: true,
  inapp_brief_comment: true,
  inapp_chat_mention: true,
  inapp_chat_dm: true
})

// Fetch preferences on mount
onMounted(async () => {
  try {
    const { preferences } = await $fetch<{ preferences: Record<string, boolean> }>('/api/notifications/preferences')
    Object.assign(state, preferences)
  } catch (error) {
    console.error('Failed to load notification preferences:', error)
    toast.add({
      title: 'Failed to load preferences',
      color: 'error',
      duration: 3000
    })
  } finally {
    loading.value = false
  }
})

const sections = [{
  title: 'Email Notifications',
  description: 'Choose which events trigger email notifications.',
  fields: [{
    name: 'email_task_assigned',
    label: 'Task Assignments',
    description: 'When someone assigns a task to you.'
  }, {
    name: 'email_task_mentioned',
    label: 'Mentions',
    description: 'When someone mentions you in a comment.'
  }, {
    name: 'email_task_due',
    label: 'Due Date Reminders',
    description: 'When a task is due soon or overdue.'
  }, {
    name: 'email_approval_request',
    label: 'Approval Requests',
    description: 'When someone requests your approval.'
  }, {
    name: 'email_weekly_digest',
    label: 'Weekly Digest',
    description: 'A summary of activity from the past week.'
  }, {
    name: 'email_board_member_added',
    label: 'Board Memberships',
    description: 'When someone adds you to a board.'
  }, {
    name: 'email_brief_assigned',
    label: 'Brief Assignments',
    description: 'When someone assigns a brief to you.'
  }, {
    name: 'email_brief_status',
    label: 'Brief Status Changes',
    description: 'When a brief you\'re watching changes status.'
  }, {
    name: 'email_brief_comment',
    label: 'Brief Comments',
    description: 'When someone comments on a brief you\'re watching.'
  }]
}, {
  title: 'In-App Notifications',
  description: 'Choose which events show in your notification bell.',
  fields: [{
    name: 'inapp_task_assigned',
    label: 'Task Assignments',
    description: 'When someone assigns a task to you.'
  }, {
    name: 'inapp_task_mentioned',
    label: 'Mentions',
    description: 'When someone mentions you in a comment.'
  }, {
    name: 'inapp_task_status',
    label: 'Status Changes',
    description: 'When a task you\'re watching changes status.'
  }, {
    name: 'inapp_task_comment',
    label: 'New Comments',
    description: 'When someone comments on your tasks.'
  }, {
    name: 'inapp_task_due',
    label: 'Due Date Reminders',
    description: 'When a task is due soon or overdue.'
  }, {
    name: 'inapp_approval',
    label: 'Approvals',
    description: 'When someone requests or completes an approval.'
  }, {
    name: 'inapp_board_member_added',
    label: 'Board Memberships',
    description: 'When someone adds you to a board.'
  }, {
    name: 'inapp_brief_assigned',
    label: 'Brief Assignments',
    description: 'When someone assigns a brief to you.'
  }, {
    name: 'inapp_brief_status',
    label: 'Brief Status Changes',
    description: 'When a brief you\'re watching changes status.'
  }, {
    name: 'inapp_brief_comment',
    label: 'Brief Comments',
    description: 'When someone comments on a brief you\'re watching.'
  }, {
    name: 'inapp_chat_mention',
    label: 'Chat Mentions',
    description: 'When someone @mentions you in a chat channel.'
  }, {
    name: 'inapp_chat_dm',
    label: 'Direct Messages',
    description: 'When someone sends you a direct chat message.'
  }]
}]

async function onChange(field: string, value: boolean) {
  saving.value = true
  try {
    await $fetch('/api/notifications/preferences', {
      method: 'PUT',
      body: {
        preferences: { [field]: value }
      }
    })
    toast.add({
      title: 'Preference saved',
      color: 'success',
      duration: 2000
    })
  } catch (error) {
    // Revert the change
    state[field] = !value
    toast.add({
      title: 'Failed to save preference',
      color: 'error',
      duration: 3000
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-8">
    <!-- Loading state -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <XfLoader size="sm" />
    </div>

    <div v-else v-for="(section, index) in sections" :key="index">
      <UPageCard
        :title="section.title"
        :description="section.description"
        variant="naked"
        class="mb-4"
      />

      <UPageCard variant="subtle" :ui="{ container: 'divide-y divide-default' }">
        <UFormField
          v-for="field in section.fields"
          :key="field.name"
          :name="field.name"
          :label="field.label"
          :description="field.description"
          class="flex items-center justify-between not-last:pb-4 gap-2"
        >
          <USwitch
            v-model="state[field.name]"
            :disabled="saving"
            @update:model-value="(val) => onChange(field.name, val)"
          />
        </UFormField>
      </UPageCard>
    </div>
  </div>
</template>
