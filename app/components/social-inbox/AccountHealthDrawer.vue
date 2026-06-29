<script setup lang="ts">
import type { SocialInboxAccountHealth, SocialInboxSyncResult } from '~/types'
import { getSocialInboxAccountHealthDisplay, getSocialInboxAccountIssueText } from '~/utils/socialInboxHealth'
import {
  formatSocialInboxSyncChannelResult,
  getSocialInboxSyncChannelsForAccount,
  getSocialInboxSyncStatusDisplay
} from '~/utils/socialInboxSync'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ accounts: SocialInboxAccountHealth[], syncResult?: SocialInboxSyncResult | null }>()

function formatDateTime(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString() : 'Not synced yet'
}

function accountTitle(account: SocialInboxAccountHealth) {
  return account.account_name || account.platform_account_id
}

function latestSyncChannels(accountId: string) {
  return getSocialInboxSyncChannelsForAccount(props.syncResult, accountId)
}
</script>

<template>
  <USlideover
    v-model:open="open"
    side="right"
    :ui="{ content: 'max-w-xl' }"
  >
    <template #content>
      <div class="flex h-full flex-col">
        <div class="flex items-center justify-between gap-3 border-b border-default p-4">
          <div>
            <h2 class="text-base font-semibold">
              Inbox account health
            </h2>
            <p class="text-sm text-muted">
              Connected accounts, sync cursors, and provider errors.
            </p>
          </div>
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            size="sm"
            aria-label="Close account health"
            @click="open = false"
          />
        </div>

        <div class="flex-1 overflow-y-auto p-4">
          <div v-if="!accounts.length" class="rounded-md border border-default p-4 text-sm text-muted">
            No connected inbox accounts for this client.
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="account in accounts"
              :key="account.id"
              class="rounded-md border border-default p-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex min-w-0 items-center gap-2">
                    <UIcon
                      :name="getSocialInboxAccountHealthDisplay(account.status).icon"
                      class="size-4 shrink-0"
                    />
                    <h3 class="truncate text-sm font-medium">
                      {{ accountTitle(account) }}
                    </h3>
                  </div>
                  <p class="mt-0.5 text-xs text-muted">
                    {{ account.platform }} · {{ account.platform_account_id }}
                  </p>
                </div>
                <UBadge
                  :color="getSocialInboxAccountHealthDisplay(account.status).color"
                  variant="subtle"
                  size="xs"
                >
                  {{ getSocialInboxAccountHealthDisplay(account.status).label }}
                </UBadge>
              </div>

              <div class="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p class="text-muted">
                    Last sync
                  </p>
                  <p class="font-medium">
                    {{ formatDateTime(account.last_synced_at) }}
                  </p>
                </div>
                <div>
                  <p class="text-muted">
                    Conversations
                  </p>
                  <p class="font-medium">
                    {{ account.conversation_count }}
                  </p>
                </div>
                <div>
                  <p class="text-muted">
                    Latest message
                  </p>
                  <p class="font-medium">
                    {{ formatDateTime(account.latest_message_at) }}
                  </p>
                </div>
                <div>
                  <p class="text-muted">
                    Token expiry
                  </p>
                  <p class="font-medium">
                    {{ account.token_expires_at ? formatDateTime(account.token_expires_at) : 'No expiry recorded' }}
                  </p>
                </div>
              </div>

              <p
                v-if="account.status !== 'healthy'"
                class="mt-3 rounded-md bg-elevated p-2 text-xs text-muted"
              >
                {{ getSocialInboxAccountIssueText(account) }}
              </p>

              <div v-if="latestSyncChannels(account.id).length" class="mt-3 border-t border-default pt-3">
                <p class="mb-2 text-xs font-medium text-muted">
                  Latest refresh
                </p>
                <div class="space-y-2">
                  <div
                    v-for="channel in latestSyncChannels(account.id)"
                    :key="`${channel.accountId}:${channel.channelType}`"
                    class="rounded-md bg-elevated/60 p-2 text-xs"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="font-medium">
                          {{ channel.channelType }}
                        </p>
                        <p class="mt-0.5 truncate text-muted">
                          {{ formatSocialInboxSyncChannelResult(channel) }}
                        </p>
                      </div>
                      <UBadge
                        :color="getSocialInboxSyncStatusDisplay(channel.status).color"
                        variant="subtle"
                        size="xs"
                      >
                        {{ getSocialInboxSyncStatusDisplay(channel.status).label }}
                      </UBadge>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="account.cursors.length" class="mt-3 border-t border-default pt-3">
                <p class="mb-2 text-xs font-medium text-muted">
                  Sync cursors
                </p>
                <div class="space-y-2">
                  <div
                    v-for="cursor in account.cursors"
                    :key="cursor.channel_type"
                    class="flex items-start justify-between gap-3 text-xs"
                  >
                    <span class="font-medium">{{ cursor.channel_type }}</span>
                    <span class="text-right text-muted">
                      {{ cursor.last_error || formatDateTime(cursor.last_synced_at) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
