<script setup lang="ts">
definePageMeta({ title: "HR Benchmark Registry", middleware: ["auth"] });

type Framework = {
  id: string;
  framework_key: string;
  name: string;
  publisher: string;
  version: string;
  source_url: string;
  criteria: Array<{ dimension: string; description?: string }>;
  status: "draft" | "active" | "retired";
  reviewed_at: string | null;
  license_terms: string | null;
  role_families: string[];
  levels: string[];
  review_due_at: string | null;
  activated_at: string | null;
  activated_by_name: string | null;
};

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown },
) => Promise<T>;
const toast = useToast();
const loading = ref(true);
const saving = ref(false);
const frameworks = ref<Framework[]>([]);
const showEditor = ref(false);
const form = reactive({
  frameworkKey: "",
  name: "",
  publisher: "",
  version: "",
  sourceUrl: "",
  licenseTerms: "",
  roleFamilies: "",
  levels: "",
  criteria: "",
  reviewDueAt: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
});
const frameworkKeyItems = [
  { label: "AMI Marketers Competency Framework", value: "ami-mcf" },
  { label: "SFIA 9", value: "sfia-9" },
  { label: "PMI PMCD", value: "pmi-pmcd" },
];
const lines = (value: string) =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
const statusColor = (
  status: Framework["status"],
): "success" | "warning" | "neutral" =>
  status === "active" ? "success" : status === "draft" ? "warning" : "neutral";

async function refresh() {
  loading.value = true;
  try {
    frameworks.value = (
      await apiFetch<{ frameworks: Framework[] }>("/api/agency/hr/benchmarks")
    ).frameworks;
  } catch (error: any) {
    toast.add({
      title: "Benchmark registry unavailable",
      description: error?.data?.statusMessage,
      color: "error",
    });
  } finally {
    loading.value = false;
  }
}
onMounted(() => void refresh());

function startDraft(framework?: Framework) {
  Object.assign(
    form,
    framework
      ? {
          frameworkKey: framework.framework_key,
          name: framework.name,
          publisher: framework.publisher,
          version: "",
          sourceUrl: framework.source_url,
          licenseTerms: framework.license_terms || "",
          roleFamilies: framework.role_families.join("\n"),
          levels: framework.levels.join("\n"),
          criteria: framework.criteria.map((item) => item.dimension).join("\n"),
          reviewDueAt: new Date(Date.now() + 365 * 86400000)
            .toISOString()
            .slice(0, 10),
        }
      : {
          frameworkKey: "",
          name: "",
          publisher: "",
          version: "",
          sourceUrl: "",
          licenseTerms: "",
          roleFamilies: "",
          levels: "",
          criteria: "",
          reviewDueAt: new Date(Date.now() + 365 * 86400000)
            .toISOString()
            .slice(0, 10),
        },
  );
  showEditor.value = true;
}

async function createDraft() {
  saving.value = true;
  try {
    await apiFetch("/api/agency/hr/benchmarks", {
      method: "POST",
      body: {
        frameworkKey: form.frameworkKey,
        name: form.name,
        publisher: form.publisher,
        version: form.version,
        sourceUrl: form.sourceUrl,
        licenseTerms: form.licenseTerms,
        roleFamilies: lines(form.roleFamilies),
        levels: lines(form.levels),
        criteria: lines(form.criteria).map((dimension) => ({ dimension })),
        reviewDueAt: form.reviewDueAt,
      },
    });
    toast.add({
      title: "Benchmark draft created",
      description:
        "It cannot be assigned to a new role until separately activated.",
      color: "success",
    });
    showEditor.value = false;
    await refresh();
  } catch (error: any) {
    toast.add({
      title: "Benchmark draft not created",
      description:
        error?.data?.statusMessage || "Review every governance field.",
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}

async function activate(framework: Framework) {
  saving.value = true;
  try {
    await apiFetch(`/api/agency/hr/benchmarks/${framework.id}/activate`, {
      method: "POST",
    });
    toast.add({
      title: `${framework.name} ${framework.version} activated`,
      description:
        "The former active version is retained as retired historical evidence.",
      color: "success",
    });
    await refresh();
  } catch (error: any) {
    toast.add({
      title: "Benchmark not activated",
      description: error?.data?.statusMessage,
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="min-h-full bg-default">
    <header class="border-b border-default bg-elevated/30">
      <div
        class="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 sm:px-8 lg:flex-row lg:items-end lg:justify-between"
      >
        <div class="max-w-3xl border-l-4 border-primary pl-5">
          <p
            class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary"
          >
            Source → version → role applicability
          </p>
          <h1
            class="mt-2 text-3xl font-semibold tracking-tight text-highlighted"
          >
            Benchmark framework registry
          </h1>
          <p class="mt-3 text-sm leading-6 text-muted">
            Register the exact external or company standard used by a role.
            Draft frameworks cannot be assigned to roles, and retired versions
            remain available for historical review reproduction.
          </p>
        </div>
        <div class="flex gap-2">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-arrow-left"
            label="Role library"
            to="/agency/hr/roles"
          /><UButton
            icon="i-lucide-plus"
            label="New benchmark version"
            @click="startDraft()"
          />
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-7xl space-y-6 px-5 py-8 sm:px-8">
      <UAlert
        color="info"
        variant="soft"
        icon="i-lucide-scale"
        title="No automatic industry-standard claim"
        description="A named publisher, exact version, source URL, licence terms, criteria and future review date are required before an owner can activate a framework."
      />
      <div v-if="loading" class="flex min-h-72 items-center justify-center">
        <UIcon
          name="i-lucide-loader-circle"
          class="size-7 animate-spin text-primary"
        />
      </div>
      <div v-else class="space-y-4">
        <article
          v-for="framework in frameworks"
          :key="framework.id"
          class="overflow-hidden rounded-xl border border-default bg-default"
        >
          <div
            class="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"
          >
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  :color="statusColor(framework.status)"
                  variant="subtle"
                  :label="framework.status"
                /><UBadge
                  color="neutral"
                  variant="outline"
                  :label="framework.framework_key"
                /><span class="font-mono text-xs text-muted"
                  >v{{ framework.version }}</span
                >
              </div>
              <h2 class="mt-3 text-lg font-semibold text-highlighted">
                {{ framework.name }}
              </h2>
              <p class="mt-1 text-sm text-muted">{{ framework.publisher }}</p>
              <p class="mt-3 text-sm leading-6 text-muted">
                {{ framework.license_terms || "Licence/use terms pending." }}
              </p>
            </div>
            <div class="flex gap-2">
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                label="New version"
                @click="startDraft(framework)"
              /><UButton
                v-if="framework.status === 'draft'"
                size="sm"
                icon="i-lucide-badge-check"
                label="Activate version"
                :loading="saving"
                @click="activate(framework)"
              />
            </div>
          </div>
          <div
            class="grid gap-px border-t border-default bg-default sm:grid-cols-4"
          >
            <div class="bg-elevated/30 p-4">
              <p class="font-mono text-lg font-semibold text-highlighted">
                {{ framework.criteria?.length || 0 }}
              </p>
              <p class="text-xs text-muted">criteria</p>
            </div>
            <div class="bg-elevated/30 p-4">
              <p class="font-mono text-lg font-semibold text-highlighted">
                {{ framework.role_families?.length || 0 }}
              </p>
              <p class="text-xs text-muted">role families</p>
            </div>
            <div class="bg-elevated/30 p-4">
              <p class="font-mono text-lg font-semibold text-highlighted">
                {{ framework.levels?.length || 0 }}
              </p>
              <p class="text-xs text-muted">levels</p>
            </div>
            <div class="bg-elevated/30 p-4">
              <p class="text-sm font-medium text-highlighted">
                {{ framework.review_due_at || "Not set" }}
              </p>
              <p class="text-xs text-muted">review due</p>
            </div>
          </div>
        </article>
      </div>
    </main>
    <USlideover
      v-model:open="showEditor"
      title="New benchmark version"
      description="Every new version starts as a non-assignable draft."
      ><template #body
        ><div class="space-y-5">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Supported framework" required
              ><USelectMenu
                v-model="form.frameworkKey"
                :items="frameworkKeyItems"
                value-key="value"
                class="w-full" /></UFormField
            ><UFormField label="Version" required
              ><UInput
                v-model="form.version"
                placeholder="2027.1"
                class="w-full"
            /></UFormField>
          </div>
          <UFormField label="Framework name" required
            ><UInput v-model="form.name" class="w-full" /></UFormField
          ><UFormField label="Publisher" required
            ><UInput v-model="form.publisher" class="w-full" /></UFormField
          ><UFormField label="Authoritative source URL" required
            ><UInput
              v-model="form.sourceUrl"
              type="url"
              class="w-full" /></UFormField
          ><UFormField label="Licence and permitted use" required
            ><UTextarea
              v-model="form.licenseTerms"
              :rows="4"
              class="w-full" /></UFormField
          ><UFormField
            label="Applicable role families"
            required
            help="One per line."
            ><UTextarea
              v-model="form.roleFamilies"
              :rows="4"
              class="w-full" /></UFormField
          ><UFormField label="Applicable levels" required help="One per line."
            ><UTextarea
              v-model="form.levels"
              :rows="4"
              class="w-full" /></UFormField
          ><UFormField
            label="Framework criteria"
            required
            help="One dimension per line."
            ><UTextarea
              v-model="form.criteria"
              :rows="7"
              class="w-full" /></UFormField
          ><UFormField label="Review due date" required
            ><UInput
              v-model="form.reviewDueAt"
              type="date"
              class="w-full" /></UFormField
          ><UAlert
            color="warning"
            variant="soft"
            icon="i-lucide-file-lock-2"
            title="Draft only"
            description="Saving does not activate the framework or change an existing role scorecard."
          /></div></template
      ><template #footer
        ><div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="showEditor = false"
          /><UButton
            icon="i-lucide-file-plus-2"
            label="Save draft version"
            :loading="saving"
            @click="createDraft"
          /></div></template
    ></USlideover>
  </div>
</template>
