<script setup lang="ts">
import { useSocialPlanner } from '~/composables/useSocialPlanner'
import { LANES } from '~/utils/socialPlannerLanes'
import type { SocialBoardPost, SocialCampaignWithCounts, SocialPlannerLane } from '~/types'

/**
 * The planner board: one dataset (board posts) shown as workflow status lanes,
 * with an optional "Group by campaign" swimlane view and a campaign filter.
 * Cards open in Compose; dragging a card across lanes drives the status change.
 */
const props = defineProps<{ clientId: string; reloadKey?: number }>()

const planner = useSocialPlanner()
const toast = useToast()

const posts = ref<SocialBoardPost[]>([])
const campaigns = ref<SocialCampaignWithCounts[]>([])
const loading = ref(false)
const groupByCampaign = ref(false)
const filterValue = ref<string>('all') // 'all' sentinel → never an empty-string USelectMenu value

const filterItems = computed(() => [
  { label: 'All campaigns', value: 'all' },
  ...campaigns.value.map(c => ({ label: c.name, value: c.id })),
])

async function load() {
  if (!props.clientId) { posts.value = []; campaigns.value = []; return }
  loading.value = true
  const campaignId = filterValue.value === 'all' ? undefined : filterValue.value
  try {
    const [board, camps] = await Promise.all([
      planner.getBoard(props.clientId, campaignId),
      planner.listCampaigns(props.clientId),
    ])
    posts.value = board
    campaigns.value = camps
  } finally { loading.value = false }
}
watch([() => props.clientId, () => props.reloadKey, filterValue], load, { immediate: true })

const postsByLane = (lane: SocialPlannerLane) => posts.value.filter(p => p.lane === lane)

interface Swimlane { key: string; name: string; color: string; posts: SocialBoardPost[] }
function swimlanesFor(lane: SocialPlannerLane): Swimlane[] {
  const inLane = postsByLane(lane)
  const groups = new Map<string, Swimlane>()
  for (const p of inLane) {
    const key = p.campaign?.id ?? '__none__'
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: p.campaign?.name ?? 'No campaign',
        color: p.campaign?.color ?? '#94a3b8',
        posts: [],
      })
    }
    groups.get(key)!.posts.push(p)
  }
  // Campaign groups first (stable by name), "No campaign" last.
  return [...groups.values()].sort((a, b) =>
    a.key === '__none__' ? 1 : b.key === '__none__' ? -1 : a.name.localeCompare(b.name))
}
const goalFor = (campaignId: string) => campaigns.value.find(c => c.id === campaignId)?.goal_post_count ?? null

function openPost(p: SocialBoardPost) {
  navigateTo({ path: '/agency/social/publishing/compose', query: { edit: p.id } })
}

// --- Drag-to-lane ---
const dragPost = ref<SocialBoardPost | null>(null)
const dragOverLane = ref<SocialPlannerLane | null>(null)
function onDragStart(e: DragEvent, post: SocialBoardPost) {
  dragPost.value = post
  if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', post.id) }
}
function onDragEnd() { dragPost.value = null; dragOverLane.value = null }

async function onDrop(lane: SocialPlannerLane) {
  const post = dragPost.value
  onDragEnd()
  if (!post || post.lane === lane) return
  if (lane === 'published') {
    toast.add({ title: 'Publish from the post', description: 'Open it to publish or schedule.', color: 'neutral' })
    return
  }
  if (lane === 'scheduled' && !post.scheduled_at) {
    toast.add({ title: 'Set a time to schedule', description: 'Opening Compose…', color: 'neutral' })
    return openPost(post)
  }
  const prev = posts.value
  posts.value = posts.value.map(p => (p.id === post.id ? { ...p, lane } : p)) // optimistic
  try {
    if (lane === 'needs_approval') {
      await $fetch(`/api/agency/social/publishing/posts/${post.id}/request-approval`, { method: 'POST' })
    } else if (lane === 'draft') {
      await planner.updatePost(post.id, { status: 'draft', approvalRequestedAt: null, approvedAt: null })
    } else if (lane === 'scheduled') {
      await planner.updatePost(post.id, { status: 'scheduled' })
    }
    await load()
  } catch (e: any) {
    posts.value = prev // rollback
    toast.add({ title: 'Could not move post', description: e?.data?.statusMessage, color: 'error' })
  }
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Toolbar -->
    <div class="flex items-center gap-3 mb-4 shrink-0">
      <USwitch v-model="groupByCampaign" label="Group by campaign" />
      <USelectMenu
        v-model="filterValue" :items="filterItems" value-key="value" label-key="label"
        icon="i-lucide-filter" class="w-52 ml-auto"
      />
    </div>

    <div v-if="loading" class="text-sm text-muted">Loading…</div>

    <!-- Board -->
    <div v-else class="flex-1 min-h-0 overflow-x-auto">
      <div class="flex gap-4 h-full min-w-max pb-2">
        <div
          v-for="lane in LANES" :key="lane.key"
          class="w-72 shrink-0 flex flex-col rounded-lg bg-elevated/40 border border-default transition-colors"
          :class="dragOverLane === lane.key ? 'border-primary bg-primary/5' : ''"
          @dragover.prevent="dragOverLane = lane.key"
          @dragleave="dragOverLane = null"
          @drop.prevent="onDrop(lane.key)"
        >
          <div class="flex items-center gap-2 px-3 py-2 border-b border-default shrink-0">
            <span class="text-sm font-medium">{{ lane.label }}</span>
            <UBadge size="xs" color="neutral" variant="subtle">{{ postsByLane(lane.key).length }}</UBadge>
          </div>

          <div class="flex-1 overflow-y-auto p-2 space-y-2">
            <!-- Flat lane -->
            <template v-if="!groupByCampaign">
              <SocialPublishingPlannerCard
                v-for="p in postsByLane(lane.key)" :key="p.id" :post="p"
                @open="openPost" @dragstart="onDragStart"
              />
              <p v-if="!postsByLane(lane.key).length" class="text-xs text-muted text-center py-6">Nothing here</p>
            </template>

            <!-- Swimlanes -->
            <template v-else>
              <div v-for="sl in swimlanesFor(lane.key)" :key="sl.key" class="space-y-2">
                <div class="flex items-center gap-1.5 text-xs text-muted px-0.5">
                  <span class="size-2 rounded-full" :style="{ backgroundColor: sl.color }" />
                  <span class="truncate font-medium">{{ sl.name }}</span>
                  <span class="ml-auto">{{ sl.posts.length }}<template v-if="sl.key !== '__none__' && goalFor(sl.key)"> / {{ goalFor(sl.key) }}</template></span>
                </div>
                <SocialPublishingPlannerCard
                  v-for="p in sl.posts" :key="p.id" :post="p"
                  @open="openPost" @dragstart="onDragStart"
                />
              </div>
              <p v-if="!postsByLane(lane.key).length" class="text-xs text-muted text-center py-6">Nothing here</p>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
