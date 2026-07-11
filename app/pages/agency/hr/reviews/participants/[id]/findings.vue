<script setup lang="ts">
definePageMeta({ title: "HR Review Findings", middleware: ["auth"] });

type Finding = {
  id: string;
  finding_type: string;
  accountability_class: string;
  title: string;
  statement: string;
  evidence_refs: string[];
  contrary_evidence_review: string;
  confidence: string;
  adverse_individual: boolean;
  participant_response_status: string;
  status: string;
  no_action_rationale: string | null;
  response: string | null;
  correction_requested: boolean | null;
  correction_detail: string | null;
  action_count: number | string;
  second_approved_by: string | null;
  published_at: string | null;
};

const route = useRoute();
const toast = useToast();
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown },
) => Promise<T>;
const findings = ref<Finding[]>([]);
const canReview = ref(false);
const isParticipant = ref(false);
const loading = ref(true);
const saving = ref(false);
const showDraft = ref(false);
const responseFinding = ref<Finding | null>(null);
const transitionFinding = ref<Finding | null>(null);
const transitionAction = ref<"request_approval" | "publish" | null>(null);
const noActionRationale = ref("");
const form = reactive({
  findingType: "role_clarity",
  accountabilityClass: "unclear",
  title: "",
  statement: "",
  evidenceRefs: "",
  contraryEvidenceReview: "",
  confidence: "low",
  adverseIndividual: false,
});
const responseForm = reactive({
  responseStatus: "received",
  response: "",
  correctionRequested: false,
  correctionDetail: "",
});
const findingTypes = [
  "role_clarity",
  "workload",
  "process",
  "dependency",
  "capability",
  "tool_access",
  "quality",
  "timeliness",
  "attendance_reliability",
  "management_system",
  "positive_contribution",
  "no_finding",
].map((value) => ({ value, label: value.replaceAll("_", " ") }));
const accountabilityItems = ["employee", "business", "shared", "unclear"].map(
  (value) => ({ value, label: value }),
);
const confidenceItems = ["low", "medium", "high"].map((value) => ({
  value,
  label: value,
}));
const statusColor = (
  status: string,
): "success" | "warning" | "error" | "neutral" | "info" =>
  status === "published"
    ? "success"
    : status === "rejected"
      ? "error"
      : status === "awaiting_second_approval"
        ? "warning"
        : status === "participant_review"
          ? "info"
          : "neutral";
const splitLines = (value: string) =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

async function load() {
  loading.value = true;
  try {
    const data = await apiFetch<{
      findings: Finding[];
      canReview: boolean;
      isParticipant: boolean;
    }>(`/api/agency/hr/reviews/participants/${route.params.id}/findings`);
    findings.value = data.findings;
    canReview.value = data.canReview;
    isParticipant.value = data.isParticipant;
  } catch (error: any) {
    toast.add({
      title: "Findings unavailable",
      description: error?.data?.statusMessage,
      color: "error",
    });
  } finally {
    loading.value = false;
  }
}
onMounted(() => void load());

async function createFinding() {
  saving.value = true;
  try {
    await apiFetch(
      `/api/agency/hr/reviews/participants/${route.params.id}/findings`,
      {
        method: "POST",
        body: { ...form, evidenceRefs: splitLines(form.evidenceRefs) },
      },
    );
    toast.add({
      title: "Finding draft created",
      description:
        "It remains private until explicitly shared for participant response.",
      color: "success",
    });
    showDraft.value = false;
    await load();
  } catch (error: any) {
    toast.add({
      title: "Finding not created",
      description: error?.data?.statusMessage,
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}

async function transition(
  finding: Finding,
  action:
    | "share_for_response"
    | "request_approval"
    | "publish"
    | "approve_and_publish"
    | "reject",
  rationale?: string,
) {
  saving.value = true;
  try {
    await apiFetch(`/api/agency/hr/findings/${finding.id}`, {
      method: "PATCH",
      body: { action, noActionRationale: rationale || undefined },
    });
    toast.add({
      title:
        action === "share_for_response"
          ? "Shared for participant response"
          : action === "approve_and_publish" || action === "publish"
            ? "Finding published"
            : action === "request_approval"
              ? "Second approval requested"
              : "Finding rejected",
      color: "success",
    });
    transitionFinding.value = null;
    transitionAction.value = null;
    noActionRationale.value = "";
    await load();
  } catch (error: any) {
    toast.add({
      title: "Finding state not changed",
      description: error?.data?.statusMessage,
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}

function preparePublication(
  finding: Finding,
  action: "request_approval" | "publish",
) {
  if (Number(finding.action_count) > 0) return void transition(finding, action);
  transitionFinding.value = finding;
  transitionAction.value = action;
  noActionRationale.value = "";
}
function openResponse(finding: Finding) {
  responseFinding.value = finding;
  responseForm.responseStatus = "received";
  responseForm.response = finding.response || "";
  responseForm.correctionRequested = Boolean(finding.correction_requested);
  responseForm.correctionDetail = finding.correction_detail || "";
}
async function saveResponse() {
  if (!responseFinding.value) return;
  saving.value = true;
  try {
    await apiFetch(
      `/api/agency/hr/findings/${responseFinding.value.id}/response`,
      {
        method: "POST",
        body: {
          responseStatus: responseForm.responseStatus,
          response:
            responseForm.responseStatus === "received"
              ? responseForm.response
              : undefined,
          correctionRequested: responseForm.correctionRequested,
          correctionDetail: responseForm.correctionRequested
            ? responseForm.correctionDetail
            : undefined,
        },
      },
    );
    toast.add({
      title:
        responseForm.responseStatus === "declined"
          ? "Response declined and recorded"
          : "Participant response recorded",
      color: "success",
    });
    responseFinding.value = null;
    await load();
  } catch (error: any) {
    toast.add({
      title: "Response not saved",
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
      <div class="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <div
          class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
        >
          <div class="max-w-3xl border-l-4 border-primary pl-5">
            <p
              class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary"
            >
              Evidence → response → approval → action
            </p>
            <h1
              class="mt-2 text-3xl font-semibold tracking-tight text-highlighted"
            >
              Governed review findings
            </h1>
            <p class="mt-3 text-sm leading-6 text-muted">
              Findings remain human-authored, source-linked and open to
              participant correction. Adverse individual findings require a
              different second approver.
            </p>
          </div>
          <div class="flex gap-2">
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-arrow-left"
              label="Scorecard"
              :to="`/agency/hr/reviews/participants/${route.params.id}`"
            /><UButton
              v-if="canReview"
              icon="i-lucide-file-plus-2"
              label="Draft finding"
              @click="showDraft = true"
            />
          </div>
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-6xl space-y-5 px-5 py-8 sm:px-8">
      <UAlert
        color="info"
        variant="soft"
        icon="i-lucide-scale"
        title="No automatic conclusions"
        description="Scores, questionnaires and operational signals do not create findings. A reviewer must consider contrary evidence, disclose the finding, and record the participant response."
      />
      <div v-if="loading" class="flex min-h-72 items-center justify-center">
        <UIcon
          name="i-lucide-loader-circle"
          class="size-7 animate-spin text-primary"
        />
      </div>
      <article
        v-for="finding in findings"
        v-else
        :key="finding.id"
        class="overflow-hidden rounded-xl border border-default bg-default"
      >
        <div class="border-b border-default bg-elevated/30 p-5">
          <div
            class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div>
              <div class="flex flex-wrap gap-2">
                <UBadge
                  color="neutral"
                  variant="outline"
                  :label="finding.finding_type.replaceAll('_', ' ')"
                /><UBadge
                  color="neutral"
                  variant="subtle"
                  :label="finding.accountability_class"
                /><UBadge
                  :color="statusColor(finding.status)"
                  variant="subtle"
                  :label="finding.status.replaceAll('_', ' ')"
                /><UBadge
                  v-if="finding.adverse_individual"
                  color="error"
                  variant="outline"
                  label="Second approval required"
                />
              </div>
              <h2 class="mt-3 text-lg font-semibold text-highlighted">
                {{ finding.title }}
              </h2>
            </div>
            <p class="font-mono text-xs uppercase tracking-wide text-muted">
              {{ finding.confidence }} confidence
            </p>
          </div>
        </div>
        <div class="space-y-4 p-5">
          <p class="whitespace-pre-line text-sm leading-6 text-highlighted">
            {{ finding.statement }}
          </p>
          <div class="grid gap-4 lg:grid-cols-2">
            <div class="rounded-lg bg-elevated/30 p-4">
              <p
                class="text-xs font-semibold uppercase tracking-wide text-muted"
              >
                Disclosed evidence
              </p>
              <ul class="mt-2 space-y-1 text-sm text-highlighted">
                <li v-for="reference in finding.evidence_refs" :key="reference">
                  {{ reference }}
                </li>
              </ul>
            </div>
            <div class="rounded-lg bg-elevated/30 p-4">
              <p
                class="text-xs font-semibold uppercase tracking-wide text-muted"
              >
                Contrary evidence considered
              </p>
              <p class="mt-2 text-sm leading-6 text-highlighted">
                {{ finding.contrary_evidence_review }}
              </p>
            </div>
          </div>
          <div
            v-if="
              finding.response ||
              finding.participant_response_status === 'declined'
            "
            class="rounded-lg border border-default p-4"
          >
            <p class="text-xs font-semibold uppercase tracking-wide text-muted">
              Participant response
            </p>
            <p class="mt-2 text-sm text-highlighted">
              {{
                finding.response ||
                "Participant declined to provide a statement."
              }}
            </p>
            <p
              v-if="finding.correction_requested"
              class="mt-2 text-sm text-warning"
            >
              Correction requested: {{ finding.correction_detail }}
            </p>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <UButton
              v-if="canReview && finding.status === 'draft'"
              color="neutral"
              variant="outline"
              label="Share for response"
              @click="transition(finding, 'share_for_response')"
            /><UButton
              v-if="
                isParticipant &&
                finding.status === 'participant_review' &&
                finding.participant_response_status === 'pending'
              "
              color="neutral"
              variant="outline"
              label="Respond or request correction"
              @click="openResponse(finding)"
            /><UButton
              v-if="
                canReview &&
                finding.status === 'participant_review' &&
                finding.participant_response_status !== 'pending' &&
                finding.adverse_individual
              "
              color="warning"
              variant="soft"
              label="Request second approval"
              @click="preparePublication(finding, 'request_approval')"
            /><UButton
              v-if="
                canReview &&
                finding.status === 'participant_review' &&
                finding.participant_response_status !== 'pending' &&
                !finding.adverse_individual
              "
              color="success"
              variant="soft"
              label="Publish finding"
              @click="preparePublication(finding, 'publish')"
            /><UButton
              v-if="canReview && finding.status === 'awaiting_second_approval'"
              color="success"
              variant="soft"
              label="Second approve and publish"
              @click="transition(finding, 'approve_and_publish')"
            /><UButton
              v-if="
                canReview &&
                ['participant_review', 'awaiting_second_approval'].includes(
                  finding.status,
                )
              "
              color="error"
              variant="ghost"
              label="Reject"
              @click="transition(finding, 'reject')"
            /><UButton
              v-if="canReview && finding.status !== 'rejected'"
              color="neutral"
              variant="ghost"
              label="Open action plans"
              :to="`/agency/hr/reviews/participants/${route.params.id}`"
            />
          </div>
        </div>
      </article>
      <div
        v-if="!loading && findings.length === 0"
        class="rounded-xl border border-dashed border-default px-6 py-14 text-center"
      >
        <UIcon name="i-lucide-file-search" class="mx-auto size-8 text-muted" />
        <p class="mt-3 font-medium text-highlighted">No findings recorded</p>
        <p class="mt-1 text-sm text-muted">
          A score or questionnaire response never becomes a finding
          automatically.
        </p>
      </div>
    </main>

    <UModal v-model:open="showDraft" :ui="{ content: 'sm:max-w-3xl' }"
      ><template #content
        ><div class="border-b border-default p-5">
          <h2 class="text-xl font-semibold text-highlighted">
            Draft evidence-linked finding
          </h2>
        </div>
        <div class="max-h-[72vh] space-y-5 overflow-y-auto p-5">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Finding type" required
              ><USelectMenu
                v-model="form.findingType"
                :items="findingTypes"
                value-key="value"
                class="w-full" /></UFormField
            ><UFormField label="Accountability" required
              ><USelectMenu
                v-model="form.accountabilityClass"
                :items="accountabilityItems"
                value-key="value"
                class="w-full"
            /></UFormField>
          </div>
          <UFormField label="Title" required
            ><UInput v-model="form.title" class="w-full" /></UFormField
          ><UFormField label="Factual statement" required
            ><UTextarea
              v-model="form.statement"
              :rows="5"
              class="w-full" /></UFormField
          ><UFormField
            label="Disclosed evidence references"
            required
            help="One stable, participant-visible reference per line."
            ><UTextarea
              v-model="form.evidenceRefs"
              :rows="4"
              class="w-full" /></UFormField
          ><UFormField
            label="Contrary evidence and alternative explanations considered"
            required
            ><UTextarea
              v-model="form.contraryEvidenceReview"
              :rows="4"
              class="w-full"
          /></UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Confidence" required
              ><USelectMenu
                v-model="form.confidence"
                :items="confidenceItems"
                value-key="value"
                class="w-full" /></UFormField
            ><UFormField label="Approval control"
              ><UCheckbox
                v-model="form.adverseIndividual"
                label="Potentially adverse individual finding"
            /></UFormField>
          </div>
        </div>
        <div class="flex justify-end gap-2 border-t border-default p-4">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="showDraft = false"
          /><UButton
            label="Create private draft"
            :loading="saving"
            @click="createFinding"
          /></div></template
    ></UModal>
    <UModal
      :open="Boolean(responseFinding)"
      @update:open="
        (value) => {
          if (!value) responseFinding = null;
        }
      "
      ><template #content
        ><div class="border-b border-default p-5">
          <h2 class="text-xl font-semibold text-highlighted">
            Your response or correction
          </h2>
          <p class="mt-1 text-sm text-muted">
            Your statement is stored with the finding and must be considered
            before publication.
          </p>
        </div>
        <div class="space-y-5 p-5">
          <UFormField label="Response choice" required
            ><USelectMenu
              v-model="responseForm.responseStatus"
              :items="[
                { label: 'Provide a statement', value: 'received' },
                { label: 'Decline to provide a statement', value: 'declined' },
              ]"
              value-key="value"
              class="w-full" /></UFormField
          ><UFormField
            v-if="responseForm.responseStatus === 'received'"
            label="Participant statement"
            required
            ><UTextarea
              v-model="responseForm.response"
              :rows="5"
              class="w-full" /></UFormField
          ><UCheckbox
            v-model="responseForm.correctionRequested"
            label="Request a factual correction"
          /><UFormField
            v-if="responseForm.correctionRequested"
            label="Correction requested"
            required
            ><UTextarea
              v-model="responseForm.correctionDetail"
              :rows="4"
              class="w-full"
          /></UFormField>
        </div>
        <div class="flex justify-end gap-2 border-t border-default p-4">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="responseFinding = null"
          /><UButton
            label="Record response"
            :loading="saving"
            @click="saveResponse"
          /></div></template
    ></UModal>
    <UModal
      :open="Boolean(transitionFinding)"
      @update:open="
        (value) => {
          if (!value) transitionFinding = null;
        }
      "
      ><template #content
        ><div class="border-b border-default p-5">
          <h2 class="text-xl font-semibold text-highlighted">
            Record no-action rationale
          </h2>
          <p class="mt-1 text-sm text-muted">
            Every published finding needs an action plan or an explicit reason
            why no action is appropriate.
          </p>
        </div>
        <div class="p-5">
          <UFormField label="Why no action is proposed" required
            ><UTextarea v-model="noActionRationale" :rows="5" class="w-full"
          /></UFormField>
        </div>
        <div class="flex justify-end gap-2 border-t border-default p-4">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="transitionFinding = null"
          /><UButton
            label="Continue"
            :disabled="noActionRationale.trim().length < 10"
            :loading="saving"
            @click="
              transitionFinding &&
              transitionAction &&
              transition(transitionFinding, transitionAction, noActionRationale)
            "
          /></div></template
    ></UModal>
  </div>
</template>
