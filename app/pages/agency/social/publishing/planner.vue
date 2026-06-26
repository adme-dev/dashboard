<script setup lang="ts">
import { useSocialPublishingClient } from '~/composables/useSocialPublishingClient'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const { clientId } = useSocialPublishingClient()
const cfg = useRuntimeConfig().public
const enabled = computed(() => !!cfg.socialPlannerEnabled)
const aiEnabled = computed(() => !!cfg.socialPlannerAiEnabled)

const reloadKey = ref(0)
const showCampaigns = ref(false)
const showAi = ref(false)
function bumpReload() { reloadKey.value++ }
</script>

<template>
  <SocialPublishingShell
    title="Planner"
    subtitle="Plan campaigns and let AI draft a week of content. Drafts flow to Compose, Queue, and the Calendar."
  >
    <template #actions>
      <template v-if="enabled">
        <UButton icon="i-lucide-folder-kanban" variant="subtle" :disabled="!clientId" @click="showCampaigns = true">Campaigns</UButton>
        <UButton v-if="aiEnabled" icon="i-lucide-sparkles" :disabled="!clientId" @click="showAi = true">Generate plan</UButton>
      </template>
    </template>

    <div v-if="!enabled" class="rounded-lg border border-default p-10 text-center text-muted">
      <UIcon name="i-lucide-folder-kanban" class="size-8 mx-auto mb-2 opacity-50" />
      <p>Planner v2 is coming soon.</p>
      <p class="text-sm mt-1">
        Posting slots now live on the
        <ULink to="/agency/social/publishing/queue" class="text-primary">Queue</ULink> page.
      </p>
    </div>
    <div v-else-if="!clientId" class="rounded-lg border border-default p-10 text-center text-muted">
      Select a client to start planning.
    </div>
    <div v-else class="space-y-4">
      <SocialPublishingPlannerAgentPanel :client-id="clientId" />
      <SocialPublishingPlannerBoard :client-id="clientId" :reload-key="reloadKey" />
    </div>

    <SocialPublishingCampaignManager v-if="enabled && clientId" v-model:open="showCampaigns" :client-id="clientId" @changed="bumpReload" />
    <SocialPublishingAiPlanModal v-if="enabled && aiEnabled && clientId" v-model:open="showAi" :client-id="clientId" @created="bumpReload" />
  </SocialPublishingShell>
</template>
