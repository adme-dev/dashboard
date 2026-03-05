<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Proof Details',
  middleware: ['auth']
})

const route = useRoute()
const toast = useToast()
const proofId = route.params.id as string

// Fetch proof details
const { data, pending, refresh } = await useFetch(`/api/agency/proofs/${proofId}`)

const proof = computed(() => (data.value as any)?.proof)
const assets = computed(() => (data.value as any)?.assets || [])
const approvers = computed(() => (data.value as any)?.approvers || [])
const comments = computed(() => (data.value as any)?.comments || [])
const activities = computed(() => (data.value as any)?.activities || [])
const versions = computed(() => (data.value as any)?.versions || [])

// Annotation viewer state
const selectedAsset = ref<any>(null)
const showAnnotationViewer = ref(false)
const annotationMode = ref<'view' | 'point' | 'rectangle'>('view')
const newAnnotationPosition = ref<{ x: number; y: number } | null>(null)
const newAnnotationRect = ref<{ x: number; y: number; width: number; height: number } | null>(null)
const newCommentText = ref('')
const isDrawingRect = ref(false)
const rectStartPos = ref<{ x: number; y: number } | null>(null)
const addingComment = ref(false)

// Get comments for selected asset
const assetComments = computed(() => {
  if (!selectedAsset.value) return []
  return comments.value.filter((c: any) => c.assetId === selectedAsset.value.id)
})

// Open annotation viewer
const openAnnotationViewer = (asset: any) => {
  selectedAsset.value = asset
  showAnnotationViewer.value = true
  annotationMode.value = 'view'
}

// Handle click on image for point annotation
const handleImageClick = (event: MouseEvent) => {
  if (annotationMode.value !== 'point') return

  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * 100
  const y = ((event.clientY - rect.top) / rect.height) * 100

  newAnnotationPosition.value = { x, y }
  newAnnotationRect.value = null
}

// Handle mouse down for rectangle annotation
const handleMouseDown = (event: MouseEvent) => {
  if (annotationMode.value !== 'rectangle') return

  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * 100
  const y = ((event.clientY - rect.top) / rect.height) * 100

  isDrawingRect.value = true
  rectStartPos.value = { x, y }
  newAnnotationRect.value = { x, y, width: 0, height: 0 }
}

// Handle mouse move for rectangle drawing
const handleMouseMove = (event: MouseEvent) => {
  if (!isDrawingRect.value || !rectStartPos.value) return

  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const currentX = ((event.clientX - rect.left) / rect.width) * 100
  const currentY = ((event.clientY - rect.top) / rect.height) * 100

  const x = Math.min(rectStartPos.value.x, currentX)
  const y = Math.min(rectStartPos.value.y, currentY)
  const width = Math.abs(currentX - rectStartPos.value.x)
  const height = Math.abs(currentY - rectStartPos.value.y)

  newAnnotationRect.value = { x, y, width, height }
}

// Handle mouse up for rectangle annotation
const handleMouseUp = () => {
  if (isDrawingRect.value && newAnnotationRect.value && newAnnotationRect.value.width > 1) {
    newAnnotationPosition.value = null
    isDrawingRect.value = false
  } else {
    isDrawingRect.value = false
    newAnnotationRect.value = null
  }
}

// Submit annotation comment
const submitAnnotation = async () => {
  if (!newCommentText.value.trim()) {
    toast.add({ title: 'Please enter a comment', color: 'error' })
    return
  }

  addingComment.value = true
  try {
    const annotation = newAnnotationPosition.value
      ? { type: 'point' as const, data: { x: newAnnotationPosition.value.x, y: newAnnotationPosition.value.y } }
      : newAnnotationRect.value
        ? { type: 'rectangle' as const, data: { ...newAnnotationRect.value } }
        : undefined

    await $fetch('/api/agency/proofs/comments', {
      method: 'POST',
      body: {
        proofId,
        assetId: selectedAsset.value?.id,
        content: newCommentText.value,
        annotation
      }
    })

    toast.add({ title: 'Comment added', color: 'success' })
    newCommentText.value = ''
    newAnnotationPosition.value = null
    newAnnotationRect.value = null
    annotationMode.value = 'view'
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to add comment', description: err.data?.message, color: 'error' })
  } finally {
    addingComment.value = false
  }
}

// Cancel annotation
const cancelAnnotation = () => {
  newAnnotationPosition.value = null
  newAnnotationRect.value = null
  newCommentText.value = ''
  annotationMode.value = 'view'
}

// Resolve comment
const resolveComment = async (commentId: string) => {
  try {
    await $fetch(`/api/agency/proofs/comments/${commentId}/resolve`, { method: 'POST' })
    toast.add({ title: 'Comment resolved', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to resolve comment', description: err.data?.message, color: 'error' })
  }
}

// Status colors
const getStatusColor = (status: string): 'neutral' | 'info' | 'warning' | 'success' | 'error' => {
  switch (status) {
    case 'draft': return 'neutral'
    case 'internal_review': return 'info'
    case 'client_review': return 'warning'
    case 'changes_requested': return 'warning'
    case 'approved': return 'success'
    case 'rejected': return 'error'
    case 'pending': return 'neutral'
    default: return 'neutral'
  }
}

const formatStatus = (status: string): string => {
  return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

// Type icons
const getTypeIcon = (type: string): string => {
  switch (type) {
    case 'design': return 'i-lucide-image'
    case 'video': return 'i-lucide-video'
    case 'document': return 'i-lucide-file-text'
    case 'website': return 'i-lucide-globe'
    case 'email': return 'i-lucide-mail'
    case 'social': return 'i-lucide-share-2'
    case 'print': return 'i-lucide-printer'
    default: return 'i-lucide-file'
  }
}

// Format helpers
const formatDate = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy')
}

const formatDateTime = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy h:mm a')
}

const formatFileSize = (bytes: number) => {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Activity icons
const getActivityIcon = (type: string): string => {
  switch (type) {
    case 'created': return 'i-lucide-plus-circle'
    case 'status_changed': return 'i-lucide-refresh-cw'
    case 'comment_added': return 'i-lucide-message-circle'
    case 'approved': return 'i-lucide-check-circle'
    case 'rejected': return 'i-lucide-x-circle'
    case 'changes_requested': return 'i-lucide-edit'
    case 'viewed': return 'i-lucide-eye'
    case 'version_created': return 'i-lucide-git-branch'
    default: return 'i-lucide-activity'
  }
}

// Approver display name
const getApproverName = (approver: any): string => {
  if (approver.teamMember) return approver.teamMember.name
  if (approver.clientContact) return approver.clientContact.name
  if (approver.name) return approver.name
  return approver.email || 'Unknown'
}

// Send for review
const sendingForReview = ref(false)
const sendForReview = async (type: 'internal' | 'client') => {
  sendingForReview.value = true
  try {
    await $fetch(`/api/agency/proofs/${proofId}/status`, {
      method: 'PUT',
      body: { status: type === 'internal' ? 'internal_review' : 'client_review' }
    })
    toast.add({ title: `Sent for ${type} review`, color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to update status', description: err.data?.message, color: 'error' })
  } finally {
    sendingForReview.value = false
  }
}

// Create new version
const creatingVersion = ref(false)
const createVersion = async () => {
  creatingVersion.value = true
  try {
    const result = await $fetch(`/api/agency/proofs/${proofId}/version`, {
      method: 'POST'
    }) as any
    toast.add({ title: 'New version created', color: 'success' })
    navigateTo(`/agency/proofs/${result.proof.id}`)
  } catch (err: any) {
    toast.add({ title: 'Failed to create version', description: err.data?.message, color: 'error' })
  } finally {
    creatingVersion.value = false
  }
}

// Edit proof modal
const showEditModal = ref(false)
const editForm = ref({
  name: '',
  description: '',
  dueDate: '',
  isUrgent: false,
  proofType: ''
})
const savingEdit = ref(false)

const openEditModal = () => {
  if (!proof.value) return
  editForm.value = {
    name: proof.value.name || '',
    description: proof.value.description || '',
    dueDate: proof.value.dueDate ? proof.value.dueDate.split('T')[0] : '',
    isUrgent: proof.value.isUrgent || false,
    proofType: proof.value.proofType || 'design'
  }
  showEditModal.value = true
}

const saveEdit = async () => {
  if (!editForm.value.name.trim()) {
    toast.add({ title: 'Name is required', color: 'error' })
    return
  }
  savingEdit.value = true
  try {
    await $fetch(`/api/agency/proofs/${proofId}`, {
      method: 'PATCH',
      body: editForm.value
    })
    toast.add({ title: 'Proof updated', color: 'success' })
    showEditModal.value = false
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to update proof', description: err.data?.message || err.message, color: 'error' })
  } finally {
    savingEdit.value = false
  }
}

// Upload assets
const fileInput = ref<HTMLInputElement | null>(null)
const uploadingAssets = ref(false)

const triggerFileUpload = () => {
  fileInput.value?.click()
}

const handleFileUpload = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return

  uploadingAssets.value = true
  try {
    // Upload files to R2 first, then register as proof assets
    const assets: Array<{ fileName: string; fileType: string; fileSize: number; fileUrl: string }> = []

    for (const file of Array.from(input.files)) {
      const formData = new FormData()
      formData.append('file', file)

      const uploadResult = await $fetch('/api/upload', {
        method: 'POST',
        body: formData
      }) as any

      assets.push({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileUrl: uploadResult.url || uploadResult.fileUrl
      })
    }

    await $fetch(`/api/agency/proofs/${proofId}/assets`, {
      method: 'POST',
      body: { assets }
    })

    toast.add({ title: `${assets.length} asset(s) uploaded`, color: 'success' })
    input.value = ''
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to upload assets', description: err.data?.message || err.message, color: 'error' })
  } finally {
    uploadingAssets.value = false
  }
}

// Add approvers modal
const showApproverModal = ref(false)
const approverSearch = ref('')
const addingApprovers = ref(false)

const { data: teamData } = await useFetch('/api/agency/team-members', { query: { limit: 100 } })
const teamMembers = computed(() => ((teamData.value as any)?.members || (teamData.value as any) || []) as any[])

const filteredTeamMembers = computed(() => {
  const search = approverSearch.value.toLowerCase()
  if (!search) return teamMembers.value
  return teamMembers.value.filter((m: any) =>
    m.name?.toLowerCase().includes(search) || m.email?.toLowerCase().includes(search)
  )
})

const existingApproverIds = computed(() =>
  approvers.value.map((a: any) => a.teamMember?.id).filter(Boolean)
)

const addApprover = async (member: any) => {
  addingApprovers.value = true
  try {
    await $fetch(`/api/agency/proofs/${proofId}/approvers`, {
      method: 'POST',
      body: {
        approvers: [{ type: 'team_member', id: member.id }]
      }
    })
    toast.add({ title: `${member.name} added as approver`, color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to add approver', description: err.data?.message || err.message, color: 'error' })
  } finally {
    addingApprovers.value = false
  }
}

const removeApprover = async (approver: any) => {
  try {
    await $fetch(`/api/agency/proofs/${proofId}/approvers/${approver.id}`, { method: 'DELETE' })
    toast.add({ title: 'Approver removed', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to remove approver', description: err.data?.message || err.message, color: 'error' })
  }
}

// Inline comments
const inlineComment = ref('')
const addingInlineComment = ref(false)

const submitInlineComment = async () => {
  if (!inlineComment.value.trim()) return
  addingInlineComment.value = true
  try {
    await $fetch('/api/agency/proofs/comments', {
      method: 'POST',
      body: {
        proofId,
        content: inlineComment.value
      }
    })
    toast.add({ title: 'Comment added', color: 'success' })
    inlineComment.value = ''
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to add comment', description: err.data?.message || err.message, color: 'error' })
  } finally {
    addingInlineComment.value = false
  }
}

// Type options for edit modal
const proofTypeOptions = [
  { label: 'Design', value: 'design' },
  { label: 'Video', value: 'video' },
  { label: 'Document', value: 'document' },
  { label: 'Website', value: 'website' },
  { label: 'Email', value: 'email' },
  { label: 'Social', value: 'social' },
  { label: 'Print', value: 'print' }
]

// Copy share link
const copyShareLink = async () => {
  if (!proof.value?.sharing?.shareToken) return
  const link = `${window.location.origin}/proofs/view/${proof.value.sharing.shareToken}`
  await navigator.clipboard.writeText(link)
  toast.add({ title: 'Share link copied', color: 'success' })
}

// Active tab
const activeTab = ref('assets')
const tabs = computed(() => [
  { label: 'Assets', value: 'assets', icon: 'i-lucide-image' },
  { label: 'Comments', value: 'comments', icon: 'i-lucide-message-circle', badge: comments.value?.filter((c: any) => !c.isResolved).length },
  { label: 'Approvers', value: 'approvers', icon: 'i-lucide-users' },
  { label: 'Activity', value: 'activity', icon: 'i-lucide-activity' },
  { label: 'Versions', value: 'versions', icon: 'i-lucide-git-branch' }
])
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar>
        <template #left>
          <UButton
            variant="ghost"
            icon="i-lucide-arrow-left"
            @click="navigateTo('/agency/proofs')"
          />
          <div v-if="proof" class="ml-2">
            <div class="flex items-center gap-2">
              <UIcon :name="getTypeIcon(proof.proofType)" class="w-5 h-5 text-muted" />
              <h1 class="font-semibold text-lg">{{ proof.name }}</h1>
              <UBadge variant="subtle" color="neutral">v{{ proof.version }}</UBadge>
              <UBadge v-if="proof.isUrgent" color="error" variant="subtle">Urgent</UBadge>
            </div>
            <p class="text-sm text-muted">
              {{ proof.project?.name }}
              <span v-if="proof.client"> · {{ proof.client.name }}</span>
            </p>
          </div>
        </template>
        <template #right>
          <UBadge v-if="proof" :color="getStatusColor(proof.status)" size="lg">
            {{ formatStatus(proof.status) }}
          </UBadge>
          <UDropdownMenu
            v-if="proof"
            :items="[[
              { label: 'Send for Internal Review', icon: 'i-lucide-users', onSelect: () => sendForReview('internal'), disabled: proof.status !== 'draft' },
              { label: 'Send to Client', icon: 'i-lucide-send', onSelect: () => sendForReview('client'), disabled: !['draft', 'internal_review'].includes(proof.status) }
            ], [
              { label: 'Create New Version', icon: 'i-lucide-git-branch', onSelect: createVersion },
              { label: 'Copy Share Link', icon: 'i-lucide-link', onSelect: copyShareLink, disabled: !proof.sharing?.shareToken },
              { label: 'Edit Proof', icon: 'i-lucide-pencil', onSelect: openEditModal }
            ]]"
          >
            <UButton label="Actions" icon="i-lucide-chevron-down" trailing variant="outline" />
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
        </div>

        <template v-else-if="proof">
          <!-- Stats Row -->
          <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <UCard>
              <div class="text-center">
                <p class="text-2xl font-bold">{{ assets.length }}</p>
                <p class="text-sm text-muted">Assets</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-2xl font-bold">{{ approvers.length }}</p>
                <p class="text-sm text-muted">Approvers</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-2xl font-bold text-emerald-500">
                  {{ approvers.filter((a: any) => a.status === 'approved').length }}
                </p>
                <p class="text-sm text-muted">Approved</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-2xl font-bold">{{ comments.length }}</p>
                <p class="text-sm text-muted">Comments</p>
              </div>
            </UCard>
            <UCard>
              <div class="text-center">
                <p class="text-2xl font-bold">{{ proof.viewCount || 0 }}</p>
                <p class="text-sm text-muted">Views</p>
              </div>
            </UCard>
          </div>

          <!-- Tabs -->
          <div class="flex gap-2 mb-6 border-b border-default pb-2">
            <UButton
              v-for="tab in tabs"
              :key="tab.value"
              :variant="activeTab === tab.value ? 'soft' : 'ghost'"
              :icon="tab.icon"
              :label="tab.label"
              @click="activeTab = tab.value"
            />
          </div>

          <!-- Assets Tab -->
          <div v-if="activeTab === 'assets'">
            <input
              ref="fileInput"
              type="file"
              multiple
              accept="image/*,video/*,application/pdf"
              class="hidden"
              @change="handleFileUpload"
            />
            <div class="flex justify-end mb-4">
              <UButton
                label="Upload Assets"
                icon="i-lucide-upload"
                variant="outline"
                :loading="uploadingAssets"
                @click="triggerFileUpload"
              />
            </div>
            <div v-if="assets.length === 0" class="text-center py-12 text-muted">
              <UIcon name="i-lucide-image" class="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No assets uploaded yet</p>
              <UButton variant="outline" label="Upload Assets" icon="i-lucide-upload" class="mt-4" @click="triggerFileUpload" />
            </div>
            <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <UCard
                v-for="asset in assets"
                :key="asset.id"
                class="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary-500 transition-all"
                @click="openAnnotationViewer(asset)"
              >
                <div class="aspect-video bg-elevated flex items-center justify-center relative">
                  <img
                    v-if="asset.thumbnailUrl || asset.fileUrl"
                    :src="asset.thumbnailUrl || asset.fileUrl"
                    :alt="asset.fileName"
                    class="w-full h-full object-cover"
                  />
                  <UIcon v-else name="i-lucide-file" class="w-12 h-12 text-dimmed" />
                  <!-- Comment count badge -->
                  <div
                    v-if="comments.filter((c: any) => c.assetId === asset.id).length > 0"
                    class="absolute top-2 right-2 bg-primary-500 text-white text-xs font-bold px-2 py-1 rounded-full"
                  >
                    {{ comments.filter((c: any) => c.assetId === asset.id).length }}
                  </div>
                </div>
                <div class="p-3">
                  <p class="font-medium text-sm truncate">{{ asset.fileName }}</p>
                  <div class="flex items-center justify-between mt-1">
                    <p class="text-xs text-muted">{{ formatFileSize(asset.fileSize) }}</p>
                    <UButton variant="ghost" size="xs" icon="i-lucide-message-circle" class="text-dimmed" />
                  </div>
                </div>
              </UCard>
            </div>

            <!-- Annotation Viewer Modal -->
            <UModal v-model:open="showAnnotationViewer" class="max-w-6xl">
              <template #content>
                <div v-if="selectedAsset" class="flex flex-col h-[80vh]">
                  <!-- Viewer Header -->
                  <div class="flex items-center justify-between p-4 border-b border-default">
                    <div class="flex items-center gap-4">
                      <h3 class="font-semibold">{{ selectedAsset.fileName }}</h3>
                      <UBadge variant="subtle" color="neutral">
                        {{ assetComments.length }} comments
                      </UBadge>
                    </div>
                    <div class="flex items-center gap-2">
                      <!-- Annotation Tools -->
                      <UButtonGroup v-if="proof?.settings?.allowAnnotations">
                        <UButton
                          :variant="annotationMode === 'view' ? 'solid' : 'ghost'"
                          icon="i-lucide-hand"
                          size="sm"
                          title="View mode"
                          @click="annotationMode = 'view'; cancelAnnotation()"
                        />
                        <UButton
                          :variant="annotationMode === 'point' ? 'solid' : 'ghost'"
                          icon="i-lucide-mouse-pointer-click"
                          size="sm"
                          title="Point annotation"
                          @click="annotationMode = 'point'; cancelAnnotation()"
                        />
                        <UButton
                          :variant="annotationMode === 'rectangle' ? 'solid' : 'ghost'"
                          icon="i-lucide-square-dashed"
                          size="sm"
                          title="Rectangle annotation"
                          @click="annotationMode = 'rectangle'; cancelAnnotation()"
                        />
                      </UButtonGroup>
                      <UButton
                        variant="ghost"
                        icon="i-lucide-x"
                        size="sm"
                        @click="showAnnotationViewer = false; cancelAnnotation()"
                      />
                    </div>
                  </div>

                  <!-- Main Content -->
                  <div class="flex-1 flex overflow-hidden">
                    <!-- Image Viewer -->
                    <div class="flex-1 relative overflow-auto bg-elevated p-4">
                      <div
                        class="relative inline-block max-w-full"
                        :class="{
                          'cursor-crosshair': annotationMode === 'point' || annotationMode === 'rectangle'
                        }"
                        @click="handleImageClick"
                        @mousedown="handleMouseDown"
                        @mousemove="handleMouseMove"
                        @mouseup="handleMouseUp"
                        @mouseleave="handleMouseUp"
                      >
                        <img
                          :src="selectedAsset.fileUrl"
                          :alt="selectedAsset.fileName"
                          class="max-w-full max-h-[60vh] object-contain select-none"
                          draggable="false"
                        />

                        <!-- Existing annotations -->
                        <template v-for="comment in assetComments" :key="comment.id">
                          <!-- Point annotation -->
                          <div
                            v-if="comment.annotation?.type === 'point'"
                            class="absolute w-6 h-6 -ml-3 -mt-3 rounded-full bg-red-500 border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-bold cursor-pointer hover:scale-110 transition-transform"
                            :style="{ left: comment.annotation.data.x + '%', top: comment.annotation.data.y + '%' }"
                            :class="{ 'opacity-50': comment.isResolved }"
                            :title="comment.content"
                          >
                            <span>{{ assetComments.indexOf(comment) + 1 }}</span>
                          </div>

                          <!-- Rectangle annotation -->
                          <div
                            v-if="comment.annotation?.type === 'rectangle'"
                            class="absolute border-2 border-red-500 bg-red-500/10 cursor-pointer hover:bg-red-500/20 transition-colors"
                            :style="{
                              left: comment.annotation.data.x + '%',
                              top: comment.annotation.data.y + '%',
                              width: comment.annotation.data.width + '%',
                              height: comment.annotation.data.height + '%'
                            }"
                            :class="{ 'opacity-50': comment.isResolved }"
                            :title="comment.content"
                          >
                            <span class="absolute -top-5 left-0 bg-red-500 text-white text-xs px-1 rounded">
                              {{ assetComments.indexOf(comment) + 1 }}
                            </span>
                          </div>
                        </template>

                        <!-- New point annotation marker -->
                        <div
                          v-if="newAnnotationPosition"
                          class="absolute w-8 h-8 -ml-4 -mt-4 rounded-full bg-blue-500 border-2 border-white shadow-lg flex items-center justify-center text-white animate-pulse"
                          :style="{ left: newAnnotationPosition.x + '%', top: newAnnotationPosition.y + '%' }"
                        >
                          <UIcon name="i-lucide-plus" class="w-4 h-4" />
                        </div>

                        <!-- New rectangle annotation -->
                        <div
                          v-if="newAnnotationRect && newAnnotationRect.width > 0"
                          class="absolute border-2 border-blue-500 bg-blue-500/20 pointer-events-none"
                          :style="{
                            left: newAnnotationRect.x + '%',
                            top: newAnnotationRect.y + '%',
                            width: newAnnotationRect.width + '%',
                            height: newAnnotationRect.height + '%'
                          }"
                        />
                      </div>

                      <!-- Annotation input (shown when a position is selected) -->
                      <div
                        v-if="(newAnnotationPosition || (newAnnotationRect && newAnnotationRect.width > 1)) && !isDrawingRect"
                        class="absolute bottom-4 left-4 right-4 bg-default rounded-lg shadow-xl p-4 border border-default"
                      >
                        <div class="flex items-start gap-3">
                          <UTextarea
                            v-model="newCommentText"
                            placeholder="Add your comment..."
                            :rows="2"
                            class="flex-1"
                            autofocus
                          />
                          <div class="flex flex-col gap-2">
                            <UButton
                              color="primary"
                              icon="i-lucide-send"
                              :loading="addingComment"
                              @click="submitAnnotation"
                            />
                            <UButton
                              variant="ghost"
                              icon="i-lucide-x"
                              @click="cancelAnnotation"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Comments Sidebar -->
                    <div class="w-80 border-l border-default flex flex-col bg-default">
                      <div class="p-4 border-b border-default">
                        <h4 class="font-semibold">Comments</h4>
                        <p class="text-xs text-muted mt-1">
                          {{ assetComments.filter((c: any) => !c.isResolved).length }} unresolved
                        </p>
                      </div>

                      <div class="flex-1 overflow-auto p-4 space-y-4">
                        <div v-if="assetComments.length === 0" class="text-center py-8 text-muted">
                          <UIcon name="i-lucide-message-circle" class="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p class="text-sm">No comments on this asset</p>
                          <p class="text-xs mt-1">Click on the image to add one</p>
                        </div>

                        <div
                          v-for="(comment, idx) in assetComments"
                          :key="comment.id"
                          class="p-3 rounded-lg bg-elevated/50"
                          :class="{ 'opacity-60': comment.isResolved }"
                        >
                          <div class="flex items-start gap-2">
                            <div
                              class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                              :class="comment.isResolved ? 'bg-gray-400' : 'bg-red-500'"
                            >
                              {{ idx + 1 }}
                            </div>
                            <div class="flex-1 min-w-0">
                              <div class="flex items-center justify-between">
                                <p class="text-sm font-medium">
                                  {{ comment.author.teamMemberName || comment.author.contactName || 'Guest' }}
                                </p>
                                <div class="flex items-center gap-1">
                                  <UBadge v-if="comment.isResolved" color="success" variant="subtle" size="xs">
                                    Resolved
                                  </UBadge>
                                  <UButton
                                    v-else
                                    variant="ghost"
                                    size="xs"
                                    icon="i-lucide-check"
                                    title="Resolve"
                                    @click="resolveComment(comment.id)"
                                  />
                                </div>
                              </div>
                              <p class="text-sm mt-1">{{ comment.content }}</p>
                              <p class="text-xs text-muted mt-2">{{ formatDateTime(comment.createdAt) }}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </UModal>
          </div>

          <!-- Comments Tab -->
          <div v-if="activeTab === 'comments'">
            <!-- Empty state -->
            <div v-if="comments.length === 0" class="text-center py-8 text-muted mb-4">
              <UIcon name="i-lucide-message-circle" class="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No comments yet</p>
            </div>

            <!-- Comments list -->
            <div v-else class="space-y-4">
              <UCard v-for="comment in comments" :key="comment.id">
                <div class="flex items-start gap-3">
                  <div class="p-2 rounded-full bg-elevated">
                    <UIcon name="i-lucide-user" class="w-4 h-4" />
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center justify-between">
                      <p class="font-medium text-sm">
                        {{ comment.author.teamMemberName || comment.author.contactName || comment.author.guestName || 'Anonymous' }}
                      </p>
                      <div class="flex items-center gap-2">
                        <UBadge v-if="comment.isResolved" color="success" variant="subtle" size="xs">
                          Resolved
                        </UBadge>
                        <span class="text-xs text-muted">{{ formatDateTime(comment.createdAt) }}</span>
                      </div>
                    </div>
                    <p class="text-sm mt-1">{{ comment.content }}</p>
                    <div v-if="comment.annotation" class="mt-2">
                      <UBadge variant="subtle" color="info" size="xs">
                        <UIcon name="i-lucide-pointer" class="w-3 h-3 mr-1" />
                        {{ comment.annotation.type }}
                      </UBadge>
                    </div>
                  </div>
                </div>
              </UCard>
            </div>

            <!-- Inline comment form (always shown) -->
            <div class="flex items-start gap-3 pt-4 mt-4 border-t border-default">
              <div class="p-2 rounded-full bg-elevated">
                <UIcon name="i-lucide-message-circle-plus" class="w-4 h-4" />
              </div>
              <div class="flex-1 flex gap-2">
                <UTextarea
                  v-model="inlineComment"
                  :placeholder="comments.length === 0 ? 'Be the first to comment...' : 'Add a comment...'"
                  :rows="2"
                  class="flex-1"
                  @keydown.meta.enter="submitInlineComment"
                />
                <UButton
                  icon="i-lucide-send"
                  color="primary"
                  :loading="addingInlineComment"
                  :disabled="!inlineComment.trim()"
                  @click="submitInlineComment"
                />
              </div>
            </div>
          </div>

          <!-- Approvers Tab -->
          <div v-if="activeTab === 'approvers'">
            <div class="flex justify-end mb-4">
              <UButton
                label="Add Approvers"
                icon="i-lucide-user-plus"
                variant="outline"
                @click="showApproverModal = true"
              />
            </div>
            <div v-if="approvers.length === 0" class="text-center py-12 text-muted">
              <UIcon name="i-lucide-users" class="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No approvers assigned yet</p>
              <UButton variant="outline" label="Add Approvers" icon="i-lucide-user-plus" class="mt-4" @click="showApproverModal = true" />
            </div>
            <div v-else class="space-y-3">
              <UCard v-for="approver in approvers" :key="approver.id">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="p-2 rounded-full bg-elevated">
                      <UIcon
                        :name="approver.type === 'team_member' ? 'i-lucide-user' : 'i-lucide-building'"
                        class="w-4 h-4"
                      />
                    </div>
                    <div>
                      <p class="font-medium">{{ getApproverName(approver) }}</p>
                      <p v-if="approver.role" class="text-xs text-muted">{{ approver.role }}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    <div v-if="approver.status !== 'pending'" class="text-right">
                      <p class="text-xs text-muted">{{ formatDateTime(approver.decisionAt) }}</p>
                      <p v-if="approver.decisionComment" class="text-xs text-dimmed max-w-xs truncate">
                        "{{ approver.decisionComment }}"
                      </p>
                    </div>
                    <UBadge :color="getStatusColor(approver.status)" variant="subtle">
                      {{ formatStatus(approver.status) }}
                    </UBadge>
                    <UButton
                      v-if="approver.status === 'pending'"
                      variant="ghost"
                      color="error"
                      size="xs"
                      icon="i-lucide-x"
                      title="Remove approver"
                      @click="removeApprover(approver)"
                    />
                  </div>
                </div>
              </UCard>
            </div>
          </div>

          <!-- Activity Tab -->
          <div v-if="activeTab === 'activity'">
            <div v-if="activities.length === 0" class="text-center py-12 text-muted">
              <UIcon name="i-lucide-activity" class="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No activity yet</p>
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="activity in activities"
                :key="activity.id"
                class="flex items-start gap-3 p-3 rounded-lg bg-elevated/50"
              >
                <div class="p-2 rounded-full bg-default shadow-sm">
                  <UIcon :name="getActivityIcon(activity.activityType)" class="w-4 h-4 text-muted" />
                </div>
                <div class="flex-1">
                  <p class="text-sm">
                    <span class="font-medium">
                      {{ activity.teamMemberName || activity.contactName || activity.guestName || 'System' }}
                    </span>
                    {{ activity.description || activity.activityType.replace(/_/g, ' ') }}
                  </p>
                  <p class="text-xs text-muted mt-1">{{ formatDateTime(activity.createdAt) }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Versions Tab -->
          <div v-if="activeTab === 'versions'">
            <div class="space-y-3">
              <UCard
                v-for="version in versions"
                :key="version.id"
                :class="{ 'ring-2 ring-primary-500': version.isCurrent }"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <UBadge
                      :color="version.isCurrent ? 'primary' : 'neutral'"
                      :variant="version.isCurrent ? 'solid' : 'subtle'"
                    >
                      v{{ version.version }}
                    </UBadge>
                    <div>
                      <p class="font-medium">
                        {{ version.isCurrent ? 'Current Version' : `Version ${version.version}` }}
                      </p>
                      <p class="text-xs text-muted">
                        Created by {{ version.createdByName }} · {{ formatDate(version.createdAt) }}
                      </p>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    <UBadge :color="getStatusColor(version.status)" variant="subtle">
                      {{ formatStatus(version.status) }}
                    </UBadge>
                    <span class="text-sm text-muted">{{ version.commentCount }} comments</span>
                    <UButton
                      v-if="!version.isCurrent"
                      variant="ghost"
                      size="xs"
                      label="View"
                      @click="navigateTo(`/agency/proofs/${version.id}`)"
                    />
                  </div>
                </div>
              </UCard>
            </div>
          </div>

          <!-- Info Sidebar -->
          <div class="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <UCard>
              <template #header>
                <h3 class="font-semibold">Details</h3>
              </template>
              <dl class="space-y-3">
                <div>
                  <dt class="text-xs text-muted">Type</dt>
                  <dd class="font-medium capitalize">{{ proof.proofType }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-muted">Due Date</dt>
                  <dd class="font-medium">{{ formatDate(proof.dueDate) }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-muted">Created By</dt>
                  <dd class="font-medium">{{ proof.createdBy?.name || '—' }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-muted">Created</dt>
                  <dd class="font-medium">{{ formatDate(proof.createdAt) }}</dd>
                </div>
              </dl>
            </UCard>

            <UCard>
              <template #header>
                <h3 class="font-semibold">Settings</h3>
              </template>
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-sm">All approvers required</span>
                  <UIcon
                    :name="proof.settings.requiresAllApprovers ? 'i-lucide-check' : 'i-lucide-x'"
                    :class="proof.settings.requiresAllApprovers ? 'text-emerald-500' : 'text-dimmed'"
                  />
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm">Comments enabled</span>
                  <UIcon
                    :name="proof.settings.allowComments ? 'i-lucide-check' : 'i-lucide-x'"
                    :class="proof.settings.allowComments ? 'text-emerald-500' : 'text-dimmed'"
                  />
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm">Annotations enabled</span>
                  <UIcon
                    :name="proof.settings.allowAnnotations ? 'i-lucide-check' : 'i-lucide-x'"
                    :class="proof.settings.allowAnnotations ? 'text-emerald-500' : 'text-dimmed'"
                  />
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm">Password protected</span>
                  <UIcon
                    :name="proof.settings.passwordProtected ? 'i-lucide-check' : 'i-lucide-x'"
                    :class="proof.settings.passwordProtected ? 'text-emerald-500' : 'text-dimmed'"
                  />
                </div>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <h3 class="font-semibold">Sharing</h3>
              </template>
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-sm">Public link</span>
                  <UBadge
                    :color="proof.sharing.publicLinkEnabled ? 'success' : 'neutral'"
                    variant="subtle"
                  >
                    {{ proof.sharing.publicLinkEnabled ? 'Enabled' : 'Disabled' }}
                  </UBadge>
                </div>
                <div v-if="proof.sharing.shareToken">
                  <UButton
                    variant="outline"
                    size="sm"
                    label="Copy Share Link"
                    icon="i-lucide-copy"
                    block
                    @click="copyShareLink"
                  />
                </div>
                <div v-if="proof.sharing.shareExpiresAt" class="text-xs text-muted">
                  Expires: {{ formatDate(proof.sharing.shareExpiresAt) }}
                </div>
              </div>
            </UCard>
          </div>
        </template>
      </div>
    </UDashboardPanel>

    <!-- Edit Proof Modal -->
    <UModal v-model:open="showEditModal">
      <template #header>
        <h3 class="font-semibold">Edit Proof</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Proof Name" required>
            <UInput v-model="editForm.name" placeholder="Proof name" />
          </UFormField>
          <UFormField label="Type">
            <USelectMenu
              v-model="editForm.proofType"
              :items="proofTypeOptions"
              value-key="value"
            />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="editForm.description" placeholder="Description..." :rows="4" />
          </UFormField>
          <UFormField label="Due Date">
            <UInput v-model="editForm.dueDate" type="date" />
          </UFormField>
          <UCheckbox v-model="editForm.isUrgent" label="Mark as urgent" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showEditModal = false" />
          <UButton color="primary" label="Save Changes" :loading="savingEdit" @click="saveEdit" />
        </div>
      </template>
    </UModal>

    <!-- Add Approvers Modal -->
    <UModal v-model:open="showApproverModal">
      <template #header>
        <h3 class="font-semibold">Add Approvers</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UInput
            v-model="approverSearch"
            placeholder="Search team members..."
            icon="i-lucide-search"
          />
          <div class="max-h-80 overflow-y-auto space-y-2">
            <div
              v-for="member in filteredTeamMembers"
              :key="member.id"
              class="flex items-center justify-between p-3 rounded-lg hover:bg-elevated/50 transition-colors"
            >
              <div class="flex items-center gap-3">
                <UAvatar :alt="member.name" size="sm" />
                <div>
                  <p class="font-medium text-sm">{{ member.name }}</p>
                  <p class="text-xs text-muted">{{ member.email }}</p>
                </div>
              </div>
              <UButton
                v-if="existingApproverIds.includes(member.id)"
                variant="ghost"
                size="xs"
                label="Added"
                disabled
                color="success"
                icon="i-lucide-check"
              />
              <UButton
                v-else
                variant="outline"
                size="xs"
                label="Add"
                icon="i-lucide-plus"
                :loading="addingApprovers"
                @click="addApprover(member)"
              />
            </div>
            <p v-if="filteredTeamMembers.length === 0" class="text-center py-4 text-muted text-sm">
              No team members found
            </p>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end">
          <UButton variant="ghost" label="Done" @click="showApproverModal = false" />
        </div>
      </template>
    </UModal>
  </div>
</template>
