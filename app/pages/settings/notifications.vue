<script setup lang="ts">
const toast = useToast()

const loading = ref(true)
const saving = ref(false)

// Browser push subscription
const push = useWebPush()

// Detect iOS Safari users on a non-installed site — push only works after
// they "Add to Home Screen". Primary signal is matchMedia (works on every
// modern browser); navigator.standalone is the legacy iOS fallback.
// iPadOS 13+ reports as a Mac in the UA, so we also accept touch + Apple GPU
// as an iOS hint.
const isIosSafari = computed(() => {
  if (!import.meta.client) return false
  const ua = navigator.userAgent
  const isIos =
    /iPhone|iPad|iPod/.test(ua) ||
    (/Mac/.test(ua) && navigator.maxTouchPoints > 1)
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
  const installed =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  return isIos && isSafari && !installed
})

async function togglePush(enable: boolean) {
  if (enable) {
    const result = await push.enable()
    if (result.ok) {
      toast.add({ title: 'Browser notifications on', color: 'success', duration: 2000 })
    } else if (result.reason === 'permission_denied') {
      toast.add({
        title: 'Permission denied',
        description: 'Enable notifications in your browser settings, then try again.',
        color: 'error',
        duration: 4000,
      })
    } else if (result.reason === 'unsupported') {
      toast.add({
        title: 'Not supported on this browser',
        color: 'error',
        duration: 3000,
      })
    } else {
      toast.add({ title: 'Failed to enable browser notifications', color: 'error', duration: 3000 })
    }
  } else {
    await push.disable()
    toast.add({ title: 'Browser notifications off', color: 'success', duration: 2000 })
  }
}

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

const autoSubscribeOnParticipation = ref(true)
const autoAckAssignments = ref(false)

async function onAutoAckChange(value: boolean) {
  try {
    await $fetch('/api/notifications/preferences', {
      method: 'PUT',
      body: { autoAckAssignments: value },
    })
    toast.add({ title: 'Preference saved', color: 'success', duration: 2000 })
  } catch {
    autoAckAssignments.value = !value
    toast.add({ title: 'Failed to save preference', color: 'error', duration: 3000 })
  }
}

interface QuietHours {
  enabled: boolean
  startMinute: number
  endMinute: number
  timezone: string
  daysOfWeek: number[]
}

function defaultQuietHours(): QuietHours {
  const tz = (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'Australia/Sydney'
  return {
    enabled: false,
    startMinute: 20 * 60, // 8pm
    endMinute: 8 * 60,    // 8am next day
    timezone: tz,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  }
}

const quietHours = ref<QuietHours>(defaultQuietHours())

const quietStart = computed({
  get: () => minutesToTime(quietHours.value.startMinute),
  set: (v: string) => { quietHours.value.startMinute = timeToMinutes(v) },
})
const quietEnd = computed({
  get: () => minutesToTime(quietHours.value.endMinute),
  set: (v: string) => { quietHours.value.endMinute = timeToMinutes(v) },
})

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(n => parseInt(n, 10))
  return (h || 0) * 60 + (m || 0)
}

const dayChips = [
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
  { value: 0, label: 'S' },
]

function toggleDay(d: number) {
  const days = quietHours.value.daysOfWeek
  if (days.includes(d)) {
    quietHours.value.daysOfWeek = days.filter(x => x !== d)
  } else {
    quietHours.value.daysOfWeek = [...days, d].sort((a, b) => a - b)
  }
  saveQuietHours()
}

let quietSaveTimer: ReturnType<typeof setTimeout> | null = null
function saveQuietHours() {
  // Refresh timezone in case browser changed (travel, etc.)
  const tz = (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || quietHours.value.timezone
  quietHours.value.timezone = tz
  if (quietSaveTimer) clearTimeout(quietSaveTimer)
  quietSaveTimer = setTimeout(async () => {
    try {
      await $fetch('/api/notifications/preferences', {
        method: 'PUT',
        body: { quietHours: quietHours.value },
      })
    } catch (err: any) {
      toast.add({
        title: 'Could not save quiet hours',
        description: err?.statusMessage || 'Please try again.',
        color: 'error',
      })
    }
  }, 350)
}

// Fetch preferences on mount
onMounted(async () => {
  try {
    const { preferences, autoSubscribeOnParticipation: aso, quietHours: qh, autoAckAssignments: aak } = await $fetch<{
      preferences: Record<string, boolean>
      autoSubscribeOnParticipation?: boolean
      quietHours?: QuietHours | null
      autoAckAssignments?: boolean
    }>('/api/notifications/preferences')
    Object.assign(state, preferences)
    if (typeof aso === 'boolean') autoSubscribeOnParticipation.value = aso
    if (typeof aak === 'boolean') autoAckAssignments.value = aak
    if (qh) quietHours.value = { ...defaultQuietHours(), ...qh }
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

async function onAutoSubscribeChange(value: boolean) {
  try {
    await $fetch('/api/notifications/preferences', {
      method: 'PUT',
      body: { autoSubscribeOnParticipation: value }
    })
    toast.add({ title: 'Preference saved', color: 'success', duration: 2000 })
  } catch {
    autoSubscribeOnParticipation.value = !value
    toast.add({ title: 'Failed to save preference', color: 'error', duration: 3000 })
  }
}

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

    <!-- Browser Push (special-cased — talks to the browser, not the prefs API) -->
    <div v-if="!loading">
      <UPageCard
        title="Browser Notifications"
        description="Get instant alerts on this device, even when XeroFlow is closed."
        variant="naked"
        class="mb-4"
      />

      <UPageCard variant="subtle">
        <UFormField
          name="push_enabled"
          label="Enable on this device"
          :description="
            !push.isSupported.value
              ? 'Your browser does not support push notifications.'
              : push.permission.value === 'denied'
                ? 'Permission was denied — enable it in your browser site settings to turn this on.'
                : 'When on, the bell rings on this device even when XeroFlow is closed.'
          "
          class="flex items-center justify-between gap-2"
        >
          <USwitch
            :model-value="push.isSubscribed.value"
            :disabled="!push.isSupported.value || push.isBusy.value || push.permission.value === 'denied'"
            @update:model-value="(val: boolean) => togglePush(val)"
          />
        </UFormField>

        <!-- iOS PWA install hint -->
        <div
          v-if="isIosSafari"
          class="mt-4 rounded-lg border border-default bg-elevated/50 px-4 py-3 text-sm flex items-start gap-3"
        >
          <UIcon name="i-lucide-info" class="size-5 text-primary shrink-0 mt-0.5" />
          <div class="space-y-1">
            <p class="font-medium">Add XeroFlow to your home screen first</p>
            <p class="text-muted">
              On iOS, push notifications only work for sites installed as an app.
              Tap <UIcon name="i-lucide-share" class="inline size-4 mx-1" /> Share &rarr;
              <em>Add to Home Screen</em>, then open the app icon and come back here to turn this on.
            </p>
          </div>
        </div>
      </UPageCard>
    </div>

    <!-- Auto-subscribe on participation -->
    <div v-if="!loading">
      <UPageCard
        title="Watching"
        description="What you automatically subscribe to as you work."
        variant="naked"
        class="mb-4"
      />
      <UPageCard variant="subtle" :ui="{ container: 'divide-y divide-default' }">
        <UFormField
          name="auto_subscribe_on_participation"
          label="Auto-watch when I participate"
          description="Subscribe me to items I create, comment on, am assigned to, or am @mentioned in. Unwatch anytime from the Watching page."
          class="flex items-center justify-between not-last:pb-4 gap-2"
        >
          <USwitch
            :model-value="autoSubscribeOnParticipation"
            @update:model-value="(val: boolean) => { autoSubscribeOnParticipation = val; onAutoSubscribeChange(val) }"
          />
        </UFormField>
        <UFormField
          name="auto_ack_assignments"
          label="Auto-acknowledge assignments"
          description="When I'm assigned to a task, post a quick acknowledgement comment automatically so the assigner knows I've been alerted."
          class="flex items-center justify-between not-last:pb-4 gap-2"
        >
          <USwitch
            :model-value="autoAckAssignments"
            @update:model-value="(val: boolean) => { autoAckAssignments = val; onAutoAckChange(val) }"
          />
        </UFormField>
      </UPageCard>
    </div>

    <!-- Quiet Hours -->
    <div v-if="!loading">
      <UPageCard
        title="Quiet Hours"
        description="Pause browser notifications during a recurring window. Your inbox still receives everything. @mentions and assignments always come through."
        variant="naked"
        class="mb-4"
      />
      <UPageCard variant="subtle">
        <UFormField
          name="quiet_hours_enabled"
          label="Enable quiet hours"
          description="When on, browser pings are suppressed during the window below."
          class="flex items-center justify-between gap-2 not-last:pb-4"
        >
          <USwitch
            v-model="quietHours.enabled"
            @update:model-value="saveQuietHours"
          />
        </UFormField>

        <div v-if="quietHours.enabled" class="space-y-4 pt-2">
          <div class="flex items-center gap-3">
            <UFormField name="quiet_start" label="From" class="flex-1">
              <UInput
                v-model="quietStart"
                type="time"
                size="sm"
                @change="saveQuietHours"
              />
            </UFormField>
            <UFormField name="quiet_end" label="Until" class="flex-1">
              <UInput
                v-model="quietEnd"
                type="time"
                size="sm"
                @change="saveQuietHours"
              />
            </UFormField>
          </div>

          <UFormField
            name="quiet_days"
            label="Days"
            description="Click to toggle. Defaults to every day."
          >
            <div class="flex gap-1.5 flex-wrap">
              <UButton
                v-for="d in dayChips"
                :key="d.value"
                :label="d.label"
                :variant="quietHours.daysOfWeek.includes(d.value) ? 'solid' : 'soft'"
                :color="quietHours.daysOfWeek.includes(d.value) ? 'primary' : 'neutral'"
                size="xs"
                class="w-9 justify-center"
                @click="toggleDay(d.value)"
              />
            </div>
          </UFormField>

          <p class="text-xs text-muted">Timezone: {{ quietHours.timezone }} (auto-detected)</p>
        </div>
      </UPageCard>
    </div>

    <div v-if="!loading" v-for="(section, index) in sections" :key="index">
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
