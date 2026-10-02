<script setup lang="ts">
interface Rule {
  id: string
  client_id: string
  account_id: string
  mode: 'paused' | 'review' | 'automatic'
  last_checked_at: string | null
  last_error: string | null
  last_result: { message?: string }
}
interface ImportRow { article_id: string, title: string, article_url: string, outcome: string, post_id: string | null, status: string | null, scheduled_at: string | null }
interface Account { id: string, platform: string, account_name: string, is_active: boolean, requires_reconnect: boolean }
const props = defineProps<{ clientId: string }>()
const toast = useToast()
const { isManager } = useAuth()
const mode = ref<Rule['mode']>('paused')
const accountId = ref<string>()
const saving = ref(false)
const checking = ref(false)
const { data, error, status, refresh } = await useFetch<{ rule: Rule | null, imports: ImportRow[] }>('/api/agency/social/publishing/news-autopost', { query: { clientId: props.clientId } })
const { data: accounts } = await useFetch<Account[]>('/api/agency/social/publishing/accounts', { query: { clientId: props.clientId } })
const accountOptions = computed(() => (accounts.value || []).filter(account => account.platform === 'facebook' && (account.is_active || account.id === data.value?.rule?.account_id)).map(account => ({ value: account.id, label: `${account.account_name || 'Facebook Page'}${account.requires_reconnect ? ' (reconnect required)' : ''}` })))
const modes = [{ value: 'paused', label: 'Paused' }, { value: 'review', label: 'Create drafts for review' }, { value: 'automatic', label: 'Automatically schedule published news' }]
const dirty = computed(() => mode.value !== data.value?.rule?.mode || accountId.value !== data.value?.rule?.account_id)
watch(data, (value) => {
  mode.value = value?.rule?.mode || 'paused'
  accountId.value = value?.rule?.account_id || accountOptions.value[0]?.value
}, { immediate: true })
watch(accountOptions, (value) => {
  if (!accountId.value) accountId.value = value[0]?.value
})
function formatTime(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Melbourne' }).format(new Date(value)) : 'Not checked yet'
}
async function save() {
  saving.value = true
  try {
    const result = await $fetch<{ cancelled: number }>('/api/agency/social/publishing/news-autopost', { method: 'PUT', body: { clientId: props.clientId, accountId: accountId.value, mode: mode.value } })
    toast.add({ title: 'News auto-posting saved', description: result.cancelled ? `${result.cancelled} pending automatic posts cancelled.` : undefined, color: 'success' })
    await refresh()
  } catch (error: unknown) {
    toast.add({ title: 'Could not save news auto-posting', description: (error as { data?: { statusMessage?: string } }).data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}
async function checkNow() {
  checking.value = true
  try {
    const result = await $fetch<{ message: string }>('/api/agency/social/publishing/news-autopost/check', { method: 'POST', body: { clientId: props.clientId } })
    toast.add({ title: 'News check complete', description: result.message, color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'Could not check news', description: (error as { data?: { statusMessage?: string } }).data?.statusMessage, color: 'error' })
  } finally {
    checking.value = false
    await refresh()
  }
}
</script>

<template>
  <section class="border border-default rounded-lg p-4 sm:p-5 mb-6 space-y-4 @container" aria-labelledby="news-autopost-title">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="news-autopost-title" class="font-semibold">
          News auto-posting
        </h2>
        <p class="text-sm text-muted mt-1 max-w-prose">
          Keep this client’s Facebook calendar supplied with published DriveAgent news. Checks run every 15 minutes.
        </p>
      </div>
      <UBadge :color="data?.rule?.mode === 'automatic' ? 'success' : data?.rule?.mode === 'review' ? 'warning' : 'neutral'" variant="subtle">
        {{ data?.rule?.mode === 'automatic' ? 'Automatic' : data?.rule?.mode === 'review' ? 'Review' : 'Paused' }}
      </UBadge>
    </div>
    <UAlert
      v-if="error"
      title="Could not load news auto-posting"
      description="Refresh to retry. Your existing calendar is unchanged."
      color="error"
    />
    <div v-else class="grid grid-cols-1 @lg:grid-cols-2 gap-4">
      <UFormField label="Facebook Page" help="Uses this client’s connected publishing account.">
        <USelect
          v-model="accountId"
          :items="accountOptions"
          value-key="value"
          label-key="label"
          placeholder="Connect a Facebook Page first"
          class="w-full"
          :disabled="saving || checking || !isManager"
        />
      </UFormField>
      <UFormField label="Posting mode" help="Pausing cancels pending automatic posts. A post already publishing can finish.">
        <USelect
          v-model="mode"
          :items="modes"
          value-key="value"
          label-key="label"
          class="w-full"
          :disabled="saving || checking || !isManager"
        />
      </UFormField>
    </div>
    <p v-if="!isManager" class="text-sm text-muted">
      A manager can change this client’s automatic approval policy.
    </p>
    <p class="text-sm text-muted max-w-prose">
      Automatic mode approves posts from this published source under the saved client policy. News uses slots labelled “news”, leaves existing posts and sponsor slots in place, and skips duplicates, archived stories and articles older than 72 hours at posting time.
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <UButton :loading="saving" :disabled="!accountId || !dirty || checking || !!error || !isManager" @click="save">
        Save settings
      </UButton>
      <UButton
        icon="i-lucide-refresh-cw"
        variant="subtle"
        :loading="checking"
        :disabled="!data?.rule || mode === 'paused' || dirty || saving"
        @click="checkNow"
      >
        Check news now
      </UButton>
      <UButton variant="ghost" :to="{ path: '/agency/social/publishing/planner', query: { client: clientId } }">
        View planner
      </UButton>
      <UButton v-if="data?.rule?.mode === 'review'" variant="ghost" :to="{ path: '/agency/social/publishing/approvals', query: { client: clientId } }">
        Review drafts
      </UButton>
    </div>
    <div v-if="data?.rule" class="text-sm space-y-1">
      <p class="text-muted">
        Last checked: {{ formatTime(data.rule.last_checked_at) }} (Melbourne time)
      </p>
      <UAlert
        v-if="data.rule.last_error"
        color="warning"
        title="News check needs attention"
        :description="data.rule.last_error"
      />
      <p v-else-if="data.rule.last_result?.message">
        {{ data.rule.last_result.message }}
      </p>
    </div>
    <p v-if="status === 'pending'" class="text-sm text-muted">
      Loading news auto-posting…
    </p>
    <div v-if="data?.imports?.length" class="divide-y divide-default border-t border-default">
      <div v-for="item in data.imports" :key="item.article_id" class="py-3 flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <a
            :href="item.article_url"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm font-medium hover:underline"
          >{{ item.title }}</a>
          <p class="text-xs text-muted mt-1">
            {{ item.outcome === 'existing' ? 'Already in the calendar' : item.status || item.outcome }}<template v-if="item.scheduled_at">
              · {{ formatTime(item.scheduled_at) }} Melbourne
            </template>
          </p>
        </div>
        <UButton
          v-if="item.post_id"
          size="xs"
          variant="ghost"
          :to="{ path: '/agency/social/publishing/compose', query: { client: clientId, edit: item.post_id } }"
        >
          View post
        </UButton>
      </div>
    </div>
    <p v-else-if="!error" class="text-sm text-muted">
      No articles imported yet. Save an active mode, then check the news or wait for the next automatic check.
    </p>
  </section>
</template>
