export type MondayProcessSummary = {
  boardId: string
  boardName: string
  itemCount: number
  blockedCount: number
  overdueCount: number
  statusNames: string[]
  sampleTitles: string[]
}

export type MondayProcessSuggestion = {
  candidateId: string
  boardId: string
  kind: 'process_profile' | 'question_bank'
  entryType: 'process_profile' | 'question_bank'
  title: string
  content: string
  rationale: string
  provenance: string[]
  limitations: string[]
}

const clean = (value: string) => value.replace(/\s+/g, ' ').trim()

export function buildMondayProcessSuggestions(summary: MondayProcessSummary): MondayProcessSuggestion[] {
  const boardName = clean(summary.boardName || `Monday board ${summary.boardId}`)
  const statuses = summary.statusNames.map(clean).filter(Boolean).slice(0, 8)
  const samples = summary.sampleTitles.map(clean).filter(Boolean).slice(0, 5)
  const provenance = [`monday-board:${summary.boardId}`, ...samples.map((_, index) => `monday-item-sample:${index + 1}`)]
  const limitations = [
    'Drafted from allowlisted structured task metadata only.',
    'Task counts, blockers and deadlines are process signals, not employee performance measures.',
    'The owner must validate scope, terminology and missing context before approval or questionnaire use.',
  ]

  const processContent = [
    `${boardName} contains ${summary.itemCount} governed work items in the approved review period.`,
    statuses.length ? `Observed workflow statuses: ${statuses.join(', ')}.` : 'No allowlisted workflow status labels were available.',
    `${summary.blockedCount} items were marked blocked and ${summary.overdueCount} were past their recorded due date when observed.`,
    samples.length ? `Representative work labels: ${samples.join('; ')}.` : 'No item labels were available within the approved field scope.',
    'This is a draft process description for owner validation. It makes no conclusion about any individual.',
  ].join(' ')

  const questionContent = JSON.stringify({
    prompt: `Thinking about work managed in ${boardName}, how clear and workable are the current handoffs, ownership and blocker-resolution steps?`,
    type: 'single_choice',
    required: false,
    options: [
      { value: 'clear_workable', label: 'Clear and workable for the work I can see' },
      { value: 'mostly_clear', label: 'Mostly clear, with occasional friction' },
      { value: 'needs_clarity', label: 'Some handoffs or ownership need clarification' },
      { value: 'needs_support', label: 'The process needs additional support or tools' },
      { value: 'not_applicable', label: 'Outside my role or visibility' },
    ],
    interpretation: 'Experience context only; never a KPI result, attendance proxy or individual performance conclusion.',
  })

  return [
    {
      candidateId: `process_profile:${summary.boardId}`,
      boardId: summary.boardId,
      kind: 'process_profile',
      entryType: 'process_profile',
      title: `${boardName} — draft process profile`,
      content: processContent,
      rationale: 'Summarises the bounded workflow metadata so the owner can validate process ownership, handoffs and blockers.',
      provenance,
      limitations,
    },
    {
      candidateId: `question_bank:${summary.boardId}`,
      boardId: summary.boardId,
      kind: 'question_bank',
      entryType: 'question_bank',
      title: `${boardName} — draft process-experience question`,
      content: questionContent,
      rationale: 'Offers a balanced, optional question about workflow clarity without assuming a problem or attributing fault.',
      provenance,
      limitations,
    },
  ]
}
