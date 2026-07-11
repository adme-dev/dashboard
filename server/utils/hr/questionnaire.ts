import { evaluateHrQuestionQuality } from './questionPolicy'

export type HrQuestionOption = {
  value: string
  label: string
}

export type HrQuestion = {
  id: string
  module: 'core' | 'role' | 'blockers'
  type: 'single_choice' | 'multiple_choice' | 'optional_text'
  prompt: string
  required: boolean
  responsibility?: string
  options?: HrQuestionOption[]
}

const CONSISTENCY_OPTIONS: HrQuestionOption[] = [
  { value: 'never', label: 'Never' },
  { value: 'rarely', label: 'Rarely' },
  { value: 'sometimes', label: 'Sometimes' },
  { value: 'often', label: 'Often' },
  { value: 'consistently', label: 'Consistently' },
  { value: 'not_applicable', label: 'Not applicable / insufficient visibility' },
]

const CLARITY_OPTIONS: HrQuestionOption[] = [
  { value: 'very_unclear', label: 'Very unclear' },
  { value: 'unclear', label: 'Unclear' },
  { value: 'mixed', label: 'Mixed or changing' },
  { value: 'clear', label: 'Clear' },
  { value: 'very_clear', label: 'Very clear' },
  { value: 'not_applicable', label: 'Not applicable / insufficient visibility' },
]

function safeId(value: string, index: number): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48)
  return `role-${index + 1}-${slug || 'responsibility'}`
}

export function buildRoleQuestionnaire(responsibilities: string[]): HrQuestion[] {
  const cleanResponsibilities = responsibilities
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 20)

  const questions: HrQuestion[] = [
    {
      id: 'core-role-clarity',
      module: 'core',
      type: 'single_choice',
      prompt: 'How clear are the responsibilities and decision rights currently associated with your role?',
      required: true,
      options: CLARITY_OPTIONS,
    },
    {
      id: 'core-workload-sustainability',
      module: 'core',
      type: 'single_choice',
      prompt: 'How often can your agreed responsibilities be completed within normal working arrangements?',
      required: true,
      options: CONSISTENCY_OPTIONS,
    },
    ...cleanResponsibilities.map((responsibility, index): HrQuestion => ({
      id: safeId(responsibility, index),
      module: 'role',
      type: 'single_choice',
      prompt: `How consistently are you able to complete this agreed responsibility to the expected standard: ${responsibility}?`,
      required: true,
      responsibility,
      options: CONSISTENCY_OPTIONS,
    })),
    {
      id: 'blockers-categories',
      module: 'blockers',
      type: 'multiple_choice',
      prompt: 'Which factors, if any, make it harder to complete your agreed responsibilities? Select all that apply.',
      required: true,
      options: [
        { value: 'competing_priorities', label: 'Competing or changing priorities' },
        { value: 'capacity', label: 'Available time or capacity' },
        { value: 'dependencies', label: 'Dependencies or hand-offs' },
        { value: 'approvals', label: 'Approval or decision delays' },
        { value: 'information', label: 'Missing information or unclear requirements' },
        { value: 'tools', label: 'Tools, access or process limitations' },
        { value: 'skills_support', label: 'Training, coaching or specialist support' },
        { value: 'none', label: 'None of these' },
        { value: 'not_applicable', label: 'Not applicable / insufficient visibility' },
      ],
    },
    {
      id: 'blockers-context',
      module: 'blockers',
      type: 'optional_text',
      prompt: 'Is there any context about your responsibilities, workload or dependencies that a reviewer should understand?',
      required: false,
    },
  ]

  const issues = questions.flatMap(question => evaluateHrQuestionQuality({
    prompt: question.prompt,
    options: question.options?.map(option => option.label),
  }).issues)
  if (issues.length > 0) {
    throw new Error(`Generated questionnaire did not pass quality policy: ${issues.map(issue => issue.code).join(', ')}`)
  }

  return questions
}
