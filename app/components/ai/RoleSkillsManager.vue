<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { OfficialDocumentationResult } from '~~/shared/types/officialDocumentation'
import type { RoleSkillAdminList, RoleSkillAdminWorkflow, RoleSkillDraftInput, RoleSkillList, RoleSkillBindings } from '~~/shared/types/roleSkills'

const props = defineProps<{ catalog: RoleSkillList, management: RoleSkillAdminList | null }>()
const emit = defineEmits<{ published: [] }>()
const toast = useToast()
const apiFetch = $fetch as <T>(url: string, options: { method: string, body: unknown }) => Promise<T>
const management = ref(props.management)
watch(() => props.management, (value) => {
  management.value = value
})
const canManage = computed(() => props.catalog.canManage && management.value !== null)
const selectedKey = ref(props.catalog.skills[0]?.key ?? props.management?.workflows[0]?.key ?? '')
const adminKey = ref(props.management?.workflows[0]?.key ?? '')
const selectedSkill = computed(() => props.catalog.skills.find(skill => skill.key === selectedKey.value))
const selectedAdmin = computed(() => management.value?.workflows.find(workflow => workflow.key === adminKey.value))
const roleItems = computed(() => management.value?.roles.map(role => ({ label: role.name, value: role.id })) ?? [])
const systemRoleItems = computed(() => management.value?.roles.filter(role => role.isSystem).map(role => ({ label: role.name, value: role.slug })) ?? [])
const groupItems = computed(() => management.value?.permissionGroups.map(group => ({ label: group, value: group })) ?? [])
const form = reactive({ label: '', description: '', prompt: '', enabled: true, allRoles: false, roleIds: [] as string[], systemRoles: [] as string[], permissionGroups: [] as string[], reason: '' })
const publishReason = ref('')
const busy = ref(false)
const formError = ref('')
watch(selectedAdmin, (workflow) => {
  const version = workflow?.draft ?? workflow?.active
  Object.assign(form, {
    label: version?.label ?? '', description: version?.description ?? '', prompt: version?.prompt ?? '', enabled: version?.enabled ?? true,
    allRoles: version?.bindings.allRoles ?? false, roleIds: [...version?.bindings.roleIds ?? []], systemRoles: [...version?.bindings.systemRoles ?? []],
    permissionGroups: [...version?.bindings.permissionGroups ?? []], reason: ''
  })
  publishReason.value = ''
  formError.value = ''
}, { immediate: true })
const roleFilter = ref('all')
const roleFilterItems = computed(() => [{ label: 'All roles', value: 'all' }, ...roleItems.value])
function matchesRole(bindings: RoleSkillBindings | undefined, role: RoleSkillAdminList['roles'][number]) {
  if (!bindings) return false
  return bindings.allRoles
    || bindings.roleIds.includes(role.id)
    || (role.isSystem && bindings.systemRoles.includes(role.slug))
    || bindings.permissionGroups.some(group => (role.permissionGroups ?? []).includes(group))
}
const matrix = computed(() => {
  const roles = management.value?.roles ?? []
  const selectedRole = roles.find(role => role.id === roleFilter.value)
  return (management.value?.workflows ?? []).filter(workflow => roleFilter.value === 'all' || (selectedRole && matchesRole(workflow.active?.bindings, selectedRole))).map((workflow) => {
    const version = workflow.active
    const bindings = version?.bindings
    const assigned = roles.filter(role => matchesRole(bindings, role)).map(role => role.name)
    return {
      skill: version?.label ?? workflow.key,
      published: version ? `v${version.version}${version.enabled ? '' : ' · disabled'}` : 'Not published',
      roles: assigned.join(', ') || 'No role assignments',
      bindings: bindings?.allRoles ? 'All roles with required access' : bindings?.permissionGroups.join(', ') || 'Role assignments only',
      draft: workflow.draft ? `v${workflow.draft.version}` : 'None'
    }
  })
})
const matrixColumns = [{ accessorKey: 'skill', header: 'Skill' }, { accessorKey: 'published', header: 'Published' }, { accessorKey: 'roles', header: 'Role discovery' }, { accessorKey: 'bindings', header: 'Binding details' }, { accessorKey: 'draft', header: 'Draft' }]
function updateWorkflow(workflow: RoleSkillAdminWorkflow) {
  if (!management.value) return
  management.value = { ...management.value, workflows: management.value.workflows.map(item => item.key === workflow.key ? workflow : item) }
}
function errorMessage(error: unknown) {
  const value = error as { data?: { statusMessage?: string }, message?: string }
  return value?.data?.statusMessage ?? value?.message ?? 'Try again.'
}
async function saveDraft() {
  if (!canManage.value || !selectedAdmin.value || busy.value) return
  if (!form.label.trim() || !form.description.trim() || !form.prompt.trim() || form.reason.trim().length < 3) {
    formError.value = 'Complete the label, description, request and a change reason of at least 3 characters.'
    return
  }
  const workflow = selectedAdmin.value
  const body: RoleSkillDraftInput = {
    expectedRevision: workflow.revision, label: form.label.trim(), description: form.description.trim(), prompt: form.prompt.trim(), enabled: form.enabled,
    bindings: { allRoles: form.allRoles, roleIds: [...form.roleIds], systemRoles: [...form.systemRoles], permissionGroups: [...form.permissionGroups] }, reason: form.reason.trim()
  }
  busy.value = true
  formError.value = ''
  try {
    updateWorkflow(await apiFetch<RoleSkillAdminWorkflow>(`/api/admin/ai/skills/${encodeURIComponent(workflow.key)}/draft`, { method: 'PUT', body }))
    toast.add({ title: 'Draft saved', description: 'Published skills are unchanged.', color: 'success' })
  } catch (error) {
    formError.value = errorMessage(error)
  } finally {
    busy.value = false
  }
}
async function publishDraft() {
  const workflow = selectedAdmin.value
  if (!canManage.value || !workflow?.draft || publishReason.value.trim().length < 3 || busy.value) return
  busy.value = true
  formError.value = ''
  try {
    updateWorkflow(await apiFetch<RoleSkillAdminWorkflow>(`/api/admin/ai/skills/${encodeURIComponent(workflow.key)}/publish`, {
      method: 'POST', body: { expectedRevision: workflow.revision, versionId: workflow.draft.id, reason: publishReason.value.trim() }
    }))
    emit('published')
    toast.add({ title: 'Skill published', description: 'Role access and evaluated-release checks still apply.', color: 'success' })
  } catch (error) {
    formError.value = errorMessage(error)
  } finally {
    busy.value = false
  }
}
const sourceUrl = ref('')
const preview = ref<OfficialDocumentationResult | null>(null)
const reading = ref(false)
const sourceError = ref('')
watch(selectedSkill, (skill) => {
  sourceUrl.value = skill?.sources[0]?.url ?? ''
  preview.value = null
}, { immediate: true })
async function readSource(url = sourceUrl.value) {
  if (!url.trim() || reading.value) return
  sourceUrl.value = url
  reading.value = true
  sourceError.value = ''
  preview.value = null
  try {
    preview.value = await apiFetch<OfficialDocumentationResult>('/api/agency/ai/documentation/read', { method: 'POST', body: { url: url.trim() } })
  } catch (error) {
    sourceError.value = errorMessage(error)
  } finally {
    reading.value = false
  }
}
</script>

<template>
  <div data-testid="role-skills-library" class="space-y-8">
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <section aria-label="Available skills" class="min-w-0 space-y-3">
        <h2 class="text-base font-semibold text-highlighted">
          Your published skills
        </h2>
        <p class="text-sm text-muted">
          Workflows available to your role. Choosing one prepares an editable request; permissions still apply.
        </p>
        <UButton
          v-for="skill in catalog.skills"
          :key="skill.key"
          variant="ghost"
          color="neutral"
          class="w-full justify-start whitespace-normal rounded-lg border px-3 py-3 text-left"
          :class="selectedKey === skill.key ? 'border-primary/40 bg-primary/5' : 'border-default'"
          @click="() => { selectedKey = skill.key }"
        >
          <span class="min-w-0">
            <span class="block font-medium">{{ skill.label }} <span class="text-xs font-normal text-muted">v{{ skill.version }}</span></span>
            <span class="mt-1 block text-xs text-muted">{{ skill.description }}</span>
            <span class="mt-1 block text-xs text-muted">{{ skill.group }} · {{ skill.persona }}</span>
          </span>
        </UButton>
        <p v-if="!catalog.skills.length" class="rounded-lg border border-default p-4 text-sm text-muted">
          No published skills are available for your role. You can still write your own request in chat.
        </p>
      </section>
      <section aria-label="Skill details and sources" class="min-w-0 space-y-4 rounded-xl border border-default p-4">
        <template v-if="selectedSkill">
          <h2 class="font-semibold text-highlighted">
            {{ selectedSkill.label }}
          </h2>
          <p class="whitespace-pre-wrap text-sm text-muted">
            {{ selectedSkill.prompt }}
          </p>
          <div>
            <h3 class="mb-2 text-sm font-medium">
              Tool manifest
            </h3>
            <div class="flex flex-wrap gap-1.5">
              <UBadge
                v-for="tool in selectedSkill.tools"
                :key="tool"
                color="neutral"
                variant="subtle"
                class="break-all"
              >
                {{ tool }}
              </UBadge>
            </div>
            <p class="mt-2 text-xs text-muted">
              Read-only capability references. A role assignment does not grant these tools or connect another agent automatically.
            </p>
          </div>
          <div v-if="selectedSkill.sources.length" class="space-y-1">
            <h3 class="text-sm font-medium">
              Source references
            </h3>
            <div v-for="source in selectedSkill.sources" :key="source.url" class="flex flex-wrap items-center justify-between gap-2">
              <UButton
                :to="source.url"
                target="_blank"
                rel="noopener noreferrer"
                variant="link"
                color="neutral"
                size="xs"
                class="min-w-0 break-all"
              >
                {{ source.title }}
              </UButton>
              <UButton
                variant="ghost"
                color="neutral"
                size="xs"
                :loading="reading"
                @click="readSource(source.url)"
              >
                Preview source
              </UButton>
            </div>
          </div>
        </template>
        <UFormField label="Official documentation URL" help="Read an approved official source. Retrieved text is a reference and is never saved into a skill automatically.">
          <UInput v-model="sourceUrl" class="w-full" placeholder="https://developers.google.com/google-ads/api/docs/start" />
        </UFormField>
        <UButton
          variant="soft"
          color="neutral"
          :loading="reading"
          :disabled="!sourceUrl.trim()"
          @click="readSource()"
        >
          Read documentation
        </UButton>
        <UAlert
          v-if="sourceError"
          color="error"
          title="Could not read documentation"
          :description="sourceError"
        />
        <div v-if="preview" data-testid="documentation-preview" class="space-y-2 rounded-lg border border-default p-3 text-xs">
          <p class="font-medium text-highlighted">
            {{ preview.title || 'Official documentation' }}
          </p>
          <p class="break-all text-muted">
            {{ preview.url || preview.requestedUrl }}
          </p>
          <p class="text-muted">
            {{ preview.status }} · {{ preview.provider }} · {{ preview.fetchedAt }}
          </p>
          <p v-if="preview.reason" class="text-muted">
            {{ preview.reason }}
          </p>
          <p v-if="preview.contentDigest" class="break-all text-muted">
            Digest: {{ preview.contentDigest }}
          </p>
          <pre v-if="preview.excerpt" class="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">{{ preview.excerpt }}</pre>
        </div>
      </section>
    </div>

    <section v-if="canManage" aria-label="Manage role skills" class="space-y-5 border-t border-default pt-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-highlighted">
            Manage role skills
          </h2>
          <p class="mt-1 max-w-2xl text-sm text-muted">
            Edit discovery and request wording. Publishing does not grant access, change the tool manifest, or mark an evaluated release as passed.
          </p>
        </div>
        <UButton
          to="/admin/ai/governance"
          variant="outline"
          color="neutral"
          icon="i-lucide-shield-check"
        >
          Evaluation and governance
        </UButton>
      </div>
      <UFormField label="View role" help="Configured discovery attachments only. Actual availability still depends on tool policy, evaluated releases and personal restrictions.">
        <USelect v-model="roleFilter" :items="roleFilterItems" class="w-full sm:w-72" />
      </UFormField>
      <UTable :data="matrix" :columns="matrixColumns" />
      <p v-if="!matrix.length" class="text-sm text-muted">
        No published skills are attached to this role. Role mappings do not grant permissions.
      </p>
      <div v-if="selectedAdmin" class="@container space-y-4 rounded-xl border border-default p-4">
        <UFormField label="Workflow">
          <USelect v-model="adminKey" :items="management?.workflows.map(item => ({ label: item.active?.label ?? item.key, value: item.key }))" class="w-full" />
        </UFormField>
        <p class="text-xs text-muted">
          {{ selectedAdmin.key }} · {{ selectedAdmin.persona }} · revision {{ selectedAdmin.revision }}
        </p>
        <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
          <UFormField label="Label">
            <UInput v-model="form.label" class="w-full" :maxlength="100" />
          </UFormField>
          <UFormField label="Description">
            <UInput v-model="form.description" class="w-full" :maxlength="500" />
          </UFormField>
          <UFormField label="Editable request" class="@lg:col-span-2">
            <UTextarea
              v-model="form.prompt"
              class="w-full"
              :rows="5"
              :maxlength="8000"
            />
          </UFormField>
          <UFormField label="Roles">
            <USelectMenu
              v-model="form.roleIds"
              :items="roleItems"
              value-key="value"
              multiple
              class="w-full"
            />
          </UFormField>
          <UFormField label="System roles">
            <USelectMenu
              v-model="form.systemRoles"
              :items="systemRoleItems"
              value-key="value"
              multiple
              class="w-full"
            />
          </UFormField>
          <UFormField label="Permission groups" class="@lg:col-span-2">
            <USelectMenu
              v-model="form.permissionGroups"
              :items="groupItems"
              value-key="value"
              multiple
              class="w-full"
            />
          </UFormField>
          <UFormField label="Role discovery" help="Any selected binding can discover the skill. Empty bindings match no roles.">
            <UCheckbox v-model="form.allRoles" label="All roles with required access" />
          </UFormField>
          <UFormField label="Availability">
            <UCheckbox v-model="form.enabled" label="Enabled when published" />
          </UFormField>
          <UFormField label="Change reason" class="@lg:col-span-2">
            <UTextarea
              v-model="form.reason"
              class="w-full"
              :rows="2"
              :maxlength="1000"
            />
          </UFormField>
        </div>
        <UAlert
          v-if="formError"
          color="error"
          title="Could not update skill"
          :description="formError"
        />
        <UButton :loading="busy" @click="saveDraft">
          Save draft
        </UButton>
        <div class="space-y-3 border-t border-default pt-4">
          <p class="text-sm text-muted">
            {{ selectedAdmin.draft ? `Ready to publish draft v${selectedAdmin.draft.version}.` : 'Save a draft before publishing.' }}
          </p>
          <UFormField label="Publish reason" help="Publish the saved draft shown above. Unsaved editor changes are not included.">
            <UTextarea
              v-model="publishReason"
              class="w-full"
              :rows="2"
              :maxlength="1000"
            />
          </UFormField>
          <UButton
            color="warning"
            :loading="busy"
            :disabled="!selectedAdmin.draft || publishReason.trim().length < 3"
            @click="publishDraft"
          >
            Publish draft
          </UButton>
        </div>
        <div class="space-y-2 border-t border-default pt-4">
          <h3 class="text-sm font-medium">
            Version history
          </h3>
          <ol class="space-y-2 text-xs text-muted">
            <li v-for="version in selectedAdmin.history" :key="version.id" class="rounded-lg bg-elevated px-3 py-2">
              <span class="font-medium text-default">v{{ version.version }} · {{ version.label }}</span>
              <span class="block">{{ version.publishedAt ? `Published ${version.publishedAt}` : `Draft ${version.createdAt}` }}</span>
              <span class="block">{{ version.publishReason || version.auditReason }}</span>
            </li>
          </ol>
          <p class="break-all text-xs text-muted">
            Immutable tool manifest: {{ selectedAdmin.tools.join(', ') }}
          </p>
          <p v-for="source in selectedAdmin.sources" :key="source.url" class="break-all text-xs text-muted">
            {{ source.title }}: {{ source.url }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
