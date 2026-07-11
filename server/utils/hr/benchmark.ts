import type { HrRoleProfileInput } from './schemas'

export type HrScorecardCriterion = {
  id: string
  label: string
  description: string
  weight: number
  frameworkKey: HrRoleProfileInput['benchmarkKey']
  evidenceRequired: string[]
}

const FRAMEWORK_CRITERIA: Record<HrRoleProfileInput['benchmarkKey'], Array<Omit<HrScorecardCriterion, 'frameworkKey' | 'evidenceRequired'>>> = {
  'ami-mcf': [
    { id: 'technical-capability', label: 'Technical marketing capability', description: 'Application of the marketing capabilities required by the published role.', weight: 40 },
    { id: 'business-capability', label: 'Business capability', description: 'Contribution to agreed commercial and operational outcomes.', weight: 30 },
    { id: 'professional-capability', label: 'Professional capability', description: 'Reliable communication, collaboration and professional practice in role context.', weight: 30 },
  ],
  'sfia-9': [
    { id: 'professional-skills', label: 'Professional skills', description: 'Demonstrated application of the SFIA skills selected for the role.', weight: 50 },
    { id: 'responsibility-level', label: 'Level of responsibility', description: 'Autonomy, influence and complexity appropriate to the agreed role level.', weight: 25 },
    { id: 'generic-attributes', label: 'Generic attributes', description: 'Business skills and behaviours evidenced in the work context.', weight: 25 },
  ],
  'pmi-pmcd': [
    { id: 'performance-competence', label: 'Performance competence', description: 'Delivery of the project outcomes and responsibilities assigned to the role.', weight: 40 },
    { id: 'knowledge-competence', label: 'Knowledge competence', description: 'Application of relevant project management knowledge to decisions and work products.', weight: 30 },
    { id: 'personal-competence', label: 'Personal competence', description: 'Observable professional conduct supporting project delivery; no personality inference.', weight: 30 },
  ],
}

export function buildBenchmarkScorecard(input: Pick<HrRoleProfileInput, 'benchmarkKey' | 'responsibilities' | 'expectedOutcomes' | 'kpis'>): HrScorecardCriterion[] {
  const evidenceRequired = [...input.responsibilities, ...input.expectedOutcomes]
  const kpiEvidence = input.kpis.length
    ? input.kpis.map(kpi => `${kpi.name} — ${kpi.sourceType}${kpi.sourceRef ? `: ${kpi.sourceRef}` : ''}`)
    : input.expectedOutcomes
  const frameworkCriteria = FRAMEWORK_CRITERIA[input.benchmarkKey].map(criterion => ({
    ...criterion,
    weight: criterion.weight * 0.7,
    frameworkKey: input.benchmarkKey,
    evidenceRequired,
  }))
  return [
    {
      id: 'role-outcomes-kpis',
      label: input.kpis.length ? 'Verified role KPI outcomes' : 'Verified role outcomes',
      description: 'Attainment of owner-approved role outcomes using source-verified evidence; questionnaire opinion is not used as the KPI result.',
      weight: 30,
      frameworkKey: input.benchmarkKey,
      evidenceRequired: kpiEvidence,
    },
    ...frameworkCriteria,
  ]
}
