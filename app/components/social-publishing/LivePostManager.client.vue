<script setup lang="ts">
import type { SocialWallPost } from '~/types'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ post: SocialWallPost | null }>()
const emit = defineEmits<{ changed: [] }>()
interface Operation { id: string, action: string, status: string, before_message: string, after_message: string | null, created_at: string, actor_name: string | null }
interface Snapshot { accountName: string, message: string | null, removed: boolean, customerApprovalRequired: boolean, readError: string, operations: Operation[] }
const accountId = ref('')
const snapshot = ref<Snapshot | null>(null)
const message = ref('')
const confirmed = ref(false)
const removeConfirmed = ref(false)
const removalOpen = ref(false)
const busy = ref(false)
const loading = ref(false)
const error = ref('')
const notice = ref('')
let version = 0
const accounts = computed(() => (props.post?.accounts || []).filter(a => a.platform === 'facebook').map(a => ({ label: a.account_name || a.platform_account_id, value: a.id })))
const unresolved = computed(() => snapshot.value?.operations.find(o => ['pending', 'uncertain'].includes(o.status)))
const locked = computed(() => busy.value || loading.value || !snapshot.value || snapshot.value.message === null || snapshot.value.removed || snapshot.value.customerApprovalRequired || !!unresolved.value)
function date(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'long' })
}
async function load() {
  const postId = props.post?.id
  const account = accountId.value
  if (!open.value || !postId || !account) return
  const request = ++version
  loading.value = true
  snapshot.value = null
  confirmed.value = false
  removalOpen.value = false
  removeConfirmed.value = false
  error.value = ''
  try {
    const data = await $fetch<Snapshot>(`/api/agency/social/publishing/posts/${postId}/live`, { query: { accountId: account }, retry: 0 })
    if (request !== version) return
    snapshot.value = data
    message.value = data.message || ''
  } catch (e: unknown) {
    if (request === version) error.value = (e as { data?: { statusMessage?: string } }).data?.statusMessage || 'Could not load Facebook controls. Management access is required.'
  } finally {
    if (request === version) loading.value = false
  }
}
watch(() => [props.post?.id, props.post?.client_id, open.value], () => {
  version++
  snapshot.value = null
  error.value = ''
  notice.value = ''
  removalOpen.value = false
  confirmed.value = false
  removeConfirmed.value = false
  const first = accounts.value[0]?.value || ''
  if (accountId.value === first) void load()
  else accountId.value = first
})
watch(accountId, () => {
  notice.value = ''
  void load()
})
watch(message, () => {
  confirmed.value = false
})
async function submit(action: 'edit' | 'remove' | 'reconcile') {
  if (busy.value || !props.post || !snapshot.value) return
  if (action !== 'reconcile' && (locked.value || (action === 'edit' ? !confirmed.value : !removeConfirmed.value))) return
  const postId = props.post.id
  const client = props.post.client_id
  const account = accountId.value
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await $fetch<{ status: string }>(`/api/agency/social/publishing/posts/${postId}/live`, { method: 'POST', retry: 0, timeout: 90000,
      body: { operationId: action === 'reconcile' ? unresolved.value?.id : crypto.randomUUID(), accountId: account, action,
        ...(action !== 'reconcile' ? { expectedMessage: snapshot.value.message } : {}),
        ...(action === 'edit' ? { message: message.value } : {}), confirmed: true }
    })
    if (props.post?.id !== postId || props.post?.client_id !== client || accountId.value !== account) return
    notice.value = result.status === 'succeeded' ? (action === 'remove' ? 'Removed from Facebook. The publication archive is retained.' : 'Facebook confirmed the caption. The revision is recorded below.') : 'Facebook has not confirmed the outcome. Further changes are blocked; check the operation below.'
    emit('changed')
    await load()
  } catch (e: unknown) {
    if (props.post?.id === postId && props.post?.client_id === client && accountId.value === account) {
      await load()
      error.value = (e as { data?: { statusMessage?: string } }).data?.statusMessage || 'The request could not be confirmed. Check the operation history before trying again.'
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Manage Facebook post"
    description="Review the current live caption and keep a record of every change."
    :dismissible="!busy"
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <div class="space-y-6">
        <UFormField label="Facebook Page">
          <USelect
            v-model="accountId"
            :items="accounts"
            :disabled="busy"
            class="w-full"
          />
        </UFormField>
        <UAlert
          v-if="notice"
          color="info"
          variant="soft"
          :description="notice"
        />
        <UAlert
          v-if="error || snapshot?.readError"
          color="error"
          variant="soft"
          title="Action unavailable"
          :description="error || snapshot?.readError"
        />
        <UButton
          color="neutral"
          variant="outline"
          :loading="loading"
          :disabled="busy"
          icon="i-lucide-refresh-cw"
          @click="load"
        >
          Refresh from Facebook
        </UButton>
        <USkeleton v-if="loading" class="h-48" />
        <template v-if="snapshot">
          <UAlert
            v-if="snapshot.removed"
            color="neutral"
            variant="soft"
            title="Removed from Facebook"
            description="The original publication, actor and revision history remain in XeroFlow."
          />
          <UAlert
            v-if="snapshot.customerApprovalRequired"
            color="warning"
            variant="soft"
            title="Customer approval required"
            description="Changes to this post need a new customer-approved version. Live changes are currently locked here."
          />
          <UAlert
            v-if="unresolved"
            color="warning"
            variant="soft"
            title="Outcome needs checking"
            description="A previous request is pending or unconfirmed. No additional change will be sent automatically."
          />
          <UButton
            v-if="unresolved?.action === 'edit'"
            :loading="busy"
            color="neutral"
            variant="outline"
            @click="submit('reconcile')"
          >
            Check caption outcome
          </UButton>
          <div v-if="snapshot.message !== null" class="space-y-4">
            <UFormField label="Current caption on Facebook">
              <p class="whitespace-pre-wrap text-sm text-muted [overflow-wrap:anywhere]">
                {{ snapshot.message }}
              </p>
            </UFormField>
            <UFormField label="Revised caption" help="Changes apply only to this Page. Images, videos and other network posts are unchanged.">
              <UTextarea
                v-model="message"
                :rows="8"
                :maxlength="10000"
                :disabled="locked"
                class="w-full"
              />
            </UFormField>
            <UCheckbox v-model="confirmed" label="I approve this caption for the selected Facebook Page." :disabled="locked" />
            <UButton :disabled="locked || !confirmed || !message.trim() || message === snapshot.message" :loading="busy" @click="submit('edit')">
              Approve and update Facebook
            </UButton>
          </div>
          <section v-if="!snapshot.removed" class="space-y-3 border-t border-default pt-5">
            <h3 class="font-semibold">
              Remove from Facebook
            </h3>
            <p class="text-sm text-muted">
              Deletes this Page’s live post. Facebook reactions and comments may be lost. XeroFlow retains its archive.
            </p>
            <UButton
              v-if="!removalOpen"
              color="error"
              variant="outline"
              :disabled="locked"
              @click="removalOpen = true"
            >
              Review removal
            </UButton>
            <template v-else>
              <UCheckbox v-model="removeConfirmed" :label="`I confirm permanent removal of this post from ${snapshot.accountName}.`" :disabled="locked" />
              <UButton
                color="error"
                :disabled="locked || !removeConfirmed"
                :loading="busy"
                @click="submit('remove')"
              >
                Permanently remove from Facebook
              </UButton>
            </template>
          </section>
          <section v-if="snapshot.operations.length" class="space-y-4 border-t border-default pt-5">
            <h3 class="font-semibold">
              Live change history
            </h3>
            <article v-for="item in snapshot.operations" :key="item.id" class="space-y-2 border-l-2 border-default pl-4">
              <p class="text-sm font-medium">
                {{ item.action === 'edit' ? 'Caption revision' : 'Removal' }} · {{ item.status }}
              </p>
              <p class="text-xs text-muted">
                {{ item.actor_name || 'Recorded account' }} · {{ date(item.created_at) }}
              </p>
              <UAccordion :items="[{ label: 'Review recorded captions', slot: 'captions' }]">
                <template #captions>
                  <p class="text-xs font-medium">
                    Before
                  </p><p class="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
                    {{ item.before_message }}
                  </p>
                  <template v-if="item.after_message !== null">
                    <p class="mt-3 text-xs font-medium">
                      Requested revision
                    </p><p class="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
                      {{ item.after_message }}
                    </p>
                  </template>
                </template>
              </UAccordion>
            </article>
          </section>
        </template>
      </div>
    </template>
  </USlideover>
</template>
