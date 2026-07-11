import { z } from 'zod'

const shortText = z.string().trim().max(500)
const longText = z.string().trim().max(5000)
const shortList = z.array(shortText).max(50)

export const hrOwnerOnboardingSchema = z.object({
  sessionId: z.string().uuid().optional(),
  currentStep: z.number().int().min(1).max(8),
  status: z.enum(['draft', 'completed']),
  answers: z.object({
    business: z.object({
      companyName: shortText.optional(),
      reviewObjectives: shortList.default([]),
      departments: shortList.default([]),
      successDefinition: longText.optional(),
    }).default({ reviewObjectives: [], departments: [] }),
    operatingModel: z.object({
      coreProcesses: shortList.default([]),
      knownDisconnects: shortList.default([]),
      workloadPressurePoints: shortList.default([]),
    }).default({ coreProcesses: [], knownDisconnects: [], workloadPressurePoints: [] }),
    roleGovernance: z.object({
      contractSource: shortText.optional(),
      responsibilityOwner: shortText.optional(),
      titleExceptions: longText.optional(),
    }).default({}),
    evidence: z.object({
      approvedSources: z.array(z.enum(['platform', 'monday', 'slack', 'email'])).max(4).default(['platform']),
      excludedChannels: shortList.default([]),
      lookbackDays: z.number().int().min(30).max(365).default(90),
      includePrivateMessages: z.literal(false).default(false),
    }).default({ approvedSources: ['platform'], excludedChannels: [], lookbackDays: 90, includePrivateMessages: false }),
    fairness: z.object({
      humanReviewRequired: z.literal(true).default(true),
      noAutomatedEmploymentDecisions: z.literal(true).default(true),
      prohibitedInferences: shortList.default(['health', 'disability', 'family status', 'personality labels']),
    }).default({
      humanReviewRequired: true,
      noAutomatedEmploymentDecisions: true,
      prohibitedInferences: ['health', 'disability', 'family status', 'personality labels'],
    }),
    questionnaire: z.object({
      interviewsIncluded: z.boolean().default(true),
      allowNotApplicable: z.literal(true).default(true),
      freeTextOptional: z.literal(true).default(true),
    }).default({ interviewsIncluded: true, allowNotApplicable: true, freeTextOptional: true }),
    communications: z.object({
      announcementSent: z.boolean().default(false),
      employeeSupportContact: shortText.optional(),
      additionalContext: longText.optional(),
    }).default({ announcementSent: false }),
    schedule: z.object({
      timezone: shortText.default('Australia/Melbourne'),
      opensAt: z.string().datetime().optional(),
      dueAt: z.string().datetime().optional(),
      closesAt: z.string().datetime().optional(),
    }).default({ timezone: 'Australia/Melbourne' }),
  }),
  consentedSources: z.array(z.enum(['platform', 'monday', 'slack', 'email'])).max(4).default(['platform']),
})

export type HrOwnerOnboardingInput = z.infer<typeof hrOwnerOnboardingSchema>

const hrRoleKpiSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional(),
  unit: z.string().trim().min(1).max(80),
  direction: z.enum(['higher_is_better', 'lower_is_better', 'within_range', 'milestone']),
  targetValue: z.number().finite().optional(),
  targetMin: z.number().finite().optional(),
  targetMax: z.number().finite().optional(),
  targetDescription: z.string().trim().max(500).optional(),
  cadence: z.enum(['weekly', 'monthly', 'quarterly', 'per_project', 'annual']),
  sourceType: z.enum(['platform', 'monday', 'approved_report', 'manual_verified', 'other']),
  sourceRef: z.string().trim().min(1).max(500),
  dataOwner: z.string().trim().max(200).optional(),
  weight: z.number().positive().max(100),
  departmentGoalVersionId: z.string().uuid().optional(),
  goalContributionWeight: z.number().positive().max(100).default(100),
  goalRationale: z.string().trim().max(1000).optional(),
}).superRefine((kpi, context) => {
  if (kpi.direction === 'within_range' && (kpi.targetMin === undefined || kpi.targetMax === undefined)) {
    context.addIssue({ code: 'custom', path: ['targetMin'], message: 'Range KPIs require minimum and maximum targets.' })
  }
  if (kpi.direction !== 'within_range' && kpi.direction !== 'milestone' && kpi.targetValue === undefined) {
    context.addIssue({ code: 'custom', path: ['targetValue'], message: 'This KPI requires a numeric target.' })
  }
  if (kpi.direction === 'milestone' && !kpi.targetDescription) {
    context.addIssue({ code: 'custom', path: ['targetDescription'], message: 'Milestone KPIs require a target description.' })
  }
})

export const hrRoleProfileSchema = z.object({
  title: z.string().trim().min(2).max(200),
  department: z.string().trim().max(200).optional(),
  purpose: z.string().trim().min(10).max(5000),
  responsibilities: z.array(z.string().trim().min(3).max(500)).min(1).max(20),
  expectedOutcomes: z.array(z.string().trim().min(3).max(500)).min(1).max(20),
  decisionAuthority: z.array(z.string().trim().min(3).max(500)).max(20).default([]),
  dependencies: z.array(z.string().trim().min(3).max(500)).max(20).default([]),
  outOfScope: z.array(z.string().trim().min(3).max(500)).max(20).default([]),
  benchmarkKey: z.enum(['ami-mcf', 'sfia-9', 'pmi-pmcd']),
  contractExtractId: z.string().uuid().optional(),
  kpis: z.array(hrRoleKpiSchema).max(12).default([]),
  publish: z.boolean().default(false),
}).superRefine((role, context) => {
  if (role.kpis.length > 0) {
    const totalWeight = role.kpis.reduce((total, kpi) => total + kpi.weight, 0)
    if (Math.abs(totalWeight - 100) > 0.01) {
      context.addIssue({ code: 'custom', path: ['kpis'], message: 'KPI weights must total 100.' })
    }
  }
})

export type HrRoleProfileInput = z.infer<typeof hrRoleProfileSchema>

export const hrRoleProfileRevisionSchema = hrRoleProfileSchema.safeExtend({
  expectedVersion: z.number().int().positive(),
})

const hrQuestionOptionSchema = z.object({
  value: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(300),
})

export const hrCommissionedQuestionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  module: z.enum(['core', 'role', 'blockers']),
  type: z.enum(['single_choice', 'multiple_choice', 'optional_text']),
  prompt: z.string().trim().min(10).max(1000),
  required: z.boolean(),
  responsibility: z.string().trim().max(500).optional(),
  options: z.array(hrQuestionOptionSchema).min(2).max(20).optional(),
  recommendationReason: z.string().trim().min(10).max(1000),
  sourceRefs: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
}).superRefine((question, context) => {
  if (question.type !== 'optional_text' && !question.options) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'Choice questions require balanced answer options.' })
  }
  if (question.type === 'optional_text' && question.required) {
    context.addIssue({ code: 'custom', path: ['required'], message: 'Free-text questions must remain optional.' })
  }
  if (question.options && new Set(question.options.map(option => option.value)).size !== question.options.length) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'Question option values must be unique.' })
  }
})

const hrReviewParticipantDraftSchema = z.object({
  teamMemberId: z.string().uuid(),
  roleProfileVersionId: z.string().uuid(),
  reviewerId: z.string().uuid().optional(),
})

const reviewCycleFields = {
  name: z.string().trim().min(3).max(200),
  purpose: z.enum(['business_review', 'probation', 'annual_review', 'role_clarity', 'pulse']).default('business_review'),
  timezone: z.string().trim().min(1).max(100).default('Australia/Melbourne'),
  opensAt: z.string().datetime(),
  dueAt: z.string().datetime(),
  closesAt: z.string().datetime(),
}

function enforceUniqueReviewParticipants(input: { participants: Array<{ teamMemberId: string }> }, context: z.RefinementCtx) {
  const participantIds = input.participants.map(participant => participant.teamMemberId)
  if (new Set(participantIds).size !== participantIds.length) {
    context.addIssue({ code: 'custom', path: ['participants'], message: 'Each team member may only appear once per cycle.' })
  }
}

export const hrReviewCycleDraftSchema = z.object({
  ...reviewCycleFields,
  participants: z.array(hrReviewParticipantDraftSchema).min(1).max(500),
}).superRefine(enforceUniqueReviewParticipants)

export const hrReviewCycleSchema = z.object({
  ...reviewCycleFields,
  ownerConfirmed: z.literal(true),
  participants: z.array(hrReviewParticipantDraftSchema.extend({
    questions: z.array(hrCommissionedQuestionSchema).min(1).max(100),
  }).superRefine((participant, context) => {
    if (new Set(participant.questions.map(question => question.id)).size !== participant.questions.length) {
      context.addIssue({ code: 'custom', path: ['questions'], message: 'Question IDs must be unique within each recipient questionnaire.' })
    }
  })).min(1).max(500),
}).superRefine(enforceUniqueReviewParticipants)

export type HrReviewCycleInput = z.infer<typeof hrReviewCycleSchema>

export const hrAssignmentScheduleChangeSchema = z.object({
  action: z.enum(['extend', 'reschedule', 'cancel', 'reopen']),
  dueAt: z.string().datetime().optional(),
  reason: z.string().trim().min(10).max(2000),
  expectedCalendarSequence: z.number().int().min(0),
}).superRefine((input, context) => {
  if (input.action !== 'cancel' && !input.dueAt) {
    context.addIssue({ code: 'custom', path: ['dueAt'], message: 'A replacement deadline is required for this action.' })
  }
})

export const hrContractRoleExtractSchema = z.object({
  roleTitle: z.string().trim().min(2).max(200),
  department: z.string().trim().max(200).optional(),
  employmentBasis: z.string().trim().max(200).optional(),
  ordinaryHours: z.string().trim().max(200).optional(),
  reportingTo: z.string().trim().max(200).optional(),
  rolePurpose: z.string().trim().min(10).max(5000),
  responsibilities: z.array(z.string().trim().min(3).max(500)).min(1).max(30),
  expectedOutcomes: z.array(z.string().trim().min(3).max(500)).max(30).default([]),
  decisionAuthority: z.array(z.string().trim().min(3).max(500)).max(30).default([]),
  roleExclusions: z.array(z.string().trim().min(3).max(500)).max(30).default([]),
  extractionMethod: z.enum(['owner_reviewed', 'ai_assisted_owner_reviewed']).default('owner_reviewed'),
  status: z.enum(['draft', 'approved']),
})

export type HrContractRoleExtractInput = z.infer<typeof hrContractRoleExtractSchema>

export const hrDepartmentGoalSchema = z.object({
  departmentId: z.string().uuid(),
  name: z.string().trim().min(2).max(200),
  objective: z.string().trim().min(10).max(2000),
  metricName: z.string().trim().min(2).max(200),
  unit: z.string().trim().min(1).max(80),
  direction: z.enum(['higher_is_better', 'lower_is_better', 'within_range', 'milestone']),
  targetValue: z.number().finite().optional(),
  targetMin: z.number().finite().optional(),
  targetMax: z.number().finite().optional(),
  targetDescription: z.string().trim().max(500).optional(),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  sourceType: z.enum(['platform', 'monday', 'approved_report', 'manual_verified', 'other']),
  sourceRef: z.string().trim().min(1).max(500),
  accountableOwnerId: z.string().uuid().optional(),
  publish: z.boolean().default(false),
}).superRefine((goal, context) => {
  if (Date.parse(goal.periodEnd) < Date.parse(goal.periodStart)) {
    context.addIssue({ code: 'custom', path: ['periodEnd'], message: 'Goal end date must be on or after its start date.' })
  }
  if (goal.direction === 'within_range' && (goal.targetMin === undefined || goal.targetMax === undefined)) {
    context.addIssue({ code: 'custom', path: ['targetMin'], message: 'Range goals require minimum and maximum targets.' })
  }
  if (goal.direction !== 'within_range' && goal.direction !== 'milestone' && goal.targetValue === undefined) {
    context.addIssue({ code: 'custom', path: ['targetValue'], message: 'This goal requires a numeric target.' })
  }
  if (goal.direction === 'milestone' && !goal.targetDescription) {
    context.addIssue({ code: 'custom', path: ['targetDescription'], message: 'Milestone goals require a target description.' })
  }
})

export const hrMondayEvidenceScopeSchema = z.object({
  workspaceIds: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  boardIds: z.array(z.string().trim().min(1).max(100)).min(1).max(200),
  destinationMappings: z.array(z.object({
    boardId: z.string().trim().min(1).max(100),
    departmentId: z.string().uuid(),
    projectId: z.string().uuid().optional(),
  })).max(200).default([]),
  allowedFields: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
  purpose: z.string().trim().min(10).max(1000),
  exclusions: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  retentionDays: z.number().int().min(30).max(2555).default(365),
  status: z.enum(['draft', 'approved']).default('draft'),
}).superRefine((scope, context) => {
  if (Date.parse(scope.periodEnd) < Date.parse(scope.periodStart)) {
    context.addIssue({ code: 'custom', path: ['periodEnd'], message: 'Evidence end date must be on or after its start date.' })
  }
  if (scope.status === 'approved' && scope.boardIds.length === 0) {
    context.addIssue({ code: 'custom', path: ['boardIds'], message: 'Approved scopes require at least one board.' })
  }
  const destinationBoardIds = scope.destinationMappings.map(mapping => mapping.boardId)
  if (new Set(destinationBoardIds).size !== destinationBoardIds.length) {
    context.addIssue({ code: 'custom', path: ['destinationMappings'], message: 'Each board may have only one destination.' })
  }
  if (scope.status === 'approved') {
    const approved = new Set(scope.boardIds)
    if (destinationBoardIds.length !== approved.size || destinationBoardIds.some(boardId => !approved.has(boardId))) {
      context.addIssue({ code: 'custom', path: ['destinationMappings'], message: 'Approved scopes require one destination for every approved board.' })
    }
  }
})

export type HrMondayEvidenceScopeInput = z.infer<typeof hrMondayEvidenceScopeSchema>

export const hrDepartmentGoalRevisionSchema = hrDepartmentGoalSchema.safeExtend({
  expectedVersion: z.number().int().positive(),
})

export const hrFollowUpSchema = z.object({
  actionType: z.enum(['learning', 'coaching', 'process_change', 'workload_adjustment', 'role_clarification', 'goal_adjustment']),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(5000),
  rationale: z.string().trim().max(3000).optional(),
  evidenceRefs: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  ownerId: z.string().uuid(),
  dueAt: z.string().datetime(),
  visibility: z.enum(['participant_and_hr', 'hr_only']).default('participant_and_hr'),
  learning: z.object({
    capability: z.string().trim().min(2).max(300),
    observableNeed: z.string().trim().min(10).max(2000),
    desiredOutcome: z.string().trim().min(10).max(2000),
    learningIntervention: z.string().trim().min(3).max(2000),
    sourceCriterionId: z.string().trim().max(100).optional(),
    sourceKpiDefinitionId: z.string().uuid().optional(),
    providerOrResource: z.string().trim().max(500).optional(),
  }).optional(),
}).superRefine((followUp, context) => {
  if (followUp.actionType === 'learning' && !followUp.learning) {
    context.addIssue({ code: 'custom', path: ['learning'], message: 'Learning details are required for a learning action.' })
  }
  if (followUp.actionType !== 'learning' && followUp.learning) {
    context.addIssue({ code: 'custom', path: ['learning'], message: 'Learning details only apply to learning actions.' })
  }
})

const hrKnowledgeSourceRefSchema = z.object({
  sourceType: z.enum([
    'business_context', 'role_profile', 'process_profile', 'responsibility_map',
    'policy', 'standard', 'evidence_definition', 'questionnaire_template',
    'published_finding', 'completed_action', 'measured_outcome', 'source_governance', 'external_reference',
  ]),
  sourceId: z.string().trim().min(1).max(200),
  label: z.string().trim().min(2).max(300),
  sourceUrl: z.string().url().max(1000).optional(),
})

const hrKnowledgeFields = {
  entryType: z.enum([
    'business_context', 'role_profile', 'process_profile', 'responsibility_map',
    'policy_standard', 'evidence_definition', 'question_bank', 'blocker_taxonomy',
    'validated_theme', 'published_finding', 'completed_action', 'measured_outcome',
    'solution_playbook', 'source_governance', 'privacy_notice', 'retention_policy', 'limitation',
  ]),
  title: z.string().trim().min(3).max(240),
  content: z.string().trim().min(10).max(30000),
  status: z.enum(['draft', 'disputed', 'approved']),
  sourceRefs: z.array(hrKnowledgeSourceRefSchema).max(50),
  provenanceNote: z.string().trim().min(10).max(3000),
  confidentiality: z.enum(['restricted_hr', 'participant_visible', 'department_aggregate']).default('restricted_hr'),
  permittedUses: z.array(z.enum(['questionnaire_design', 'role_clarity', 'evidence_interpretation', 'review_context', 'solution_recommendation', 'aggregate_reporting'])).min(1).max(6),
  limitations: z.array(z.string().trim().min(3).max(1000)).max(20).default([]),
  effectiveFrom: z.string().date(),
  reviewDueAt: z.string().date(),
  retentionReviewAt: z.string().date().optional(),
  disputeNote: z.string().trim().min(10).max(3000).optional(),
  ownerId: z.string().uuid().optional(),
}

function validateHrKnowledgeGovernance(input: {
  status: string
  sourceRefs: unknown[]
  effectiveFrom: string
  reviewDueAt: string
  retentionReviewAt?: string
  disputeNote?: string
}, context: z.RefinementCtx) {
  if (input.status === 'approved' && input.sourceRefs.length === 0) {
    context.addIssue({ code: 'custom', path: ['sourceRefs'], message: 'Approved knowledge requires at least one source.' })
  }
  if (input.status === 'disputed' && !input.disputeNote) {
    context.addIssue({ code: 'custom', path: ['disputeNote'], message: 'Disputed knowledge requires a dispute note.' })
  }
  if (Date.parse(input.reviewDueAt) < Date.parse(input.effectiveFrom)) {
    context.addIssue({ code: 'custom', path: ['reviewDueAt'], message: 'Review date must be on or after the effective date.' })
  }
  if (input.retentionReviewAt && Date.parse(input.retentionReviewAt) < Date.parse(input.effectiveFrom)) {
    context.addIssue({ code: 'custom', path: ['retentionReviewAt'], message: 'Retention review must be on or after the effective date.' })
  }
}

export const hrKnowledgeEntrySchema = z.object(hrKnowledgeFields).superRefine(validateHrKnowledgeGovernance)
export const hrKnowledgeRevisionSchema = z.object({
  ...hrKnowledgeFields,
  expectedVersion: z.number().int().positive(),
}).superRefine(validateHrKnowledgeGovernance)
