import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'

interface TaskAssistRequest {
  description?: string
  taskId?: string
  boardId?: string
  workspaceId?: string
  boardName?: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<TaskAssistRequest>(event)

  if (!body.description && !body.taskId) {
    throw createError({ statusCode: 400, statusMessage: 'Either description or taskId is required' })
  }

  // Fetch context data in parallel
  const [teamMembers, projects, statuses, existingTask] = await Promise.all([
    queryRows(`
      SELECT u.id, u.name, u.email, u.role,
        COALESCE(
          (SELECT COUNT(*) FROM tasks t
           WHERE t.assignee_id = u.id
             AND t.completed_at IS NULL),
          0
        )::int AS active_task_count
      FROM users u
      WHERE u.is_active = true
      ORDER BY u.name
    `),
    queryRows(`
      SELECT p.id, p.name, c.name AS client_name
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.status = 'active'
      ORDER BY p.name
    `),
    body.boardId
      ? queryRows(`
          SELECT id, name, color, category, is_default, is_final, sort_order
          FROM task_statuses
          WHERE department_id = $1 OR department_id IS NULL
          ORDER BY sort_order
        `, [body.boardId])
      : queryRows(`
          SELECT id, name, color, category, is_default, is_final, sort_order
          FROM task_statuses
          ORDER BY sort_order
        `),
    body.taskId
      ? queryOne(`
          SELECT t.id, t.title, t.description, t.priority, t.status_id,
            t.assignee_id, t.project_id, t.due_date, t.start_date,
            t.estimated_hours, t.actual_hours, t.is_blocked, t.blocked_reason,
            t.created_at, t.updated_at, t.completed_at,
            ts.name AS status_name, ts.category AS status_category, ts.is_final,
            u.name AS assignee_name,
            p.name AS project_name
          FROM tasks t
          LEFT JOIN task_statuses ts ON ts.id = t.status_id
          LEFT JOIN users u ON u.id = t.assignee_id
          LEFT JOIN projects p ON p.id = t.project_id
          WHERE t.id = $1
        `, [body.taskId])
      : null
  ])

  // Build context strings
  const teamContext = teamMembers.map((m: any) =>
    `- ${m.name} (ID: ${m.id}, role: ${m.role}, active tasks: ${m.active_task_count})`
  ).join('\n')

  const projectContext = projects.map((p: any) =>
    `- ${p.name}${p.client_name ? ` (Client: ${p.client_name})` : ''} (ID: ${p.id})`
  ).join('\n')

  const statusContext = statuses.map((s: any) =>
    `- ${s.name} (ID: ${s.id}, category: ${s.category}${s.is_default ? ', default' : ''}${s.is_final ? ', final' : ''})`
  ).join('\n')

  const today = new Date().toISOString().split('T')[0]

  if (body.taskId && existingTask) {
    // Task analysis mode
    const prompt = `Analyze this existing task and suggest actions:

Task: "${existingTask.title}"
${existingTask.description ? `Description: ${existingTask.description}` : ''}
Status: ${existingTask.status_name} (category: ${existingTask.status_category})
Priority: ${existingTask.priority || 'not set'}
Assignee: ${existingTask.assignee_name || 'unassigned'}
Project: ${existingTask.project_name || 'none'}
Due date: ${existingTask.due_date || 'not set'}
Start date: ${existingTask.start_date || 'not set'}
Estimated hours: ${existingTask.estimated_hours || 'not set'}
Actual hours: ${existingTask.actual_hours || 'not set'}
Blocked: ${existingTask.is_blocked ? `Yes - ${existingTask.blocked_reason}` : 'No'}
Created: ${existingTask.created_at}
Updated: ${existingTask.updated_at}
Completed: ${existingTask.completed_at || 'not completed'}
Today: ${today}

Available statuses:
${statusContext}

Available team members:
${teamContext}

Available projects:
${projectContext}

Respond with a JSON object containing:
1. "actions" - array of 1-3 recommended actions. Each has:
   - "type": one of "status_change", "assign", "set_date", "set_priority"
   - "label": short button label (e.g. "Move to In Progress", "Assign to Jane")
   - "reason": one sentence explaining why
   - "value": the actual value (statusId for status_change, assigneeId for assign, ISO date string for set_date, priority string for set_priority)
2. "insights" - 2-3 sentence analysis of the task's current state and what should happen next

Only suggest actions that would actually change the current state (don't suggest the current status/assignee).
Use ONLY valid IDs from the lists above.`

    const systemPrompt = `You are a project management AI assistant for a digital marketing agency. Analyze tasks and provide actionable recommendations. Always respond with valid JSON only, no markdown fences.`

    try {
      const response = await generateGroqInsight(prompt, {
        model: GROQ_MODELS.LLAMA_70B,
        temperature: 0.2,
        maxTokens: 1000,
        systemPrompt
      })

      const parsed = JSON.parse(response.replace(/```json?\n?|\n?```/g, '').trim())

      // Validate action IDs
      const validStatusIds = new Set(statuses.map((s: any) => s.id))
      const validMemberIds = new Set(teamMembers.map((m: any) => m.id))

      if (parsed.actions) {
        parsed.actions = parsed.actions.filter((action: any) => {
          if (action.type === 'status_change') return validStatusIds.has(action.value)
          if (action.type === 'assign') return validMemberIds.has(action.value)
          if (action.type === 'set_date') return /^\d{4}-\d{2}-\d{2}/.test(action.value)
          if (action.type === 'set_priority') return ['urgent', 'high', 'medium', 'low'].includes(action.value)
          return false
        })
      }

      return parsed
    } catch (error: any) {
      console.error('AI task analysis error:', error)
      return { actions: [], insights: 'Unable to analyze task at this time.' }
    }
  }

  // Creation assist mode
  const prompt = `Parse this natural language task description and extract structured fields:

"${body.description}"

${body.boardName ? `This is for the board: "${body.boardName}"` : ''}
Today's date: ${today}

Available statuses:
${statusContext}

Available team members:
${teamContext}

Available projects:
${projectContext}

Respond with a JSON object:
{
  "title": "concise task title",
  "description": "expanded task description with details (or empty string if the input is already concise enough to be just a title)",
  "priority": "urgent|high|medium|low",
  "assigneeId": "ID from team list or null",
  "assigneeName": "name of suggested assignee or null",
  "assigneeReason": "one sentence why this person (based on role/workload) or null",
  "projectId": "ID from project list or null",
  "projectName": "name of matched project or null",
  "dueDate": "YYYY-MM-DD or null",
  "startDate": "YYYY-MM-DD or null",
  "estimatedHours": number or null,
  "statusId": "ID of suggested status or null",
  "confidence": 0.0-1.0 how confident you are,
  "suggestions": ["1-2 brief tips or missing info notes"]
}

Rules:
- Extract dates relative to today (${today}). "next Friday" = the next Friday from today.
- Match assignee by name, role, or department mention. Prefer team members with fewer active tasks.
- Match project by name or client name.
- Use ONLY valid IDs from the provided lists. If no match, use null.
- Set confidence based on how much you could extract.`

  const systemPrompt = `You are a task creation assistant for a digital marketing agency. Parse natural language into structured task fields. Always respond with valid JSON only, no markdown fences.`

  try {
    const response = await generateGroqInsight(prompt, {
      model: GROQ_MODELS.LLAMA_70B,
      temperature: 0.2,
      maxTokens: 1000,
      systemPrompt
    })

    const parsed = JSON.parse(response.replace(/```json?\n?|\n?```/g, '').trim())

    // Validate IDs against real data
    const validStatusIds = new Set(statuses.map((s: any) => s.id))
    const validMemberIds = new Set(teamMembers.map((m: any) => m.id))
    const validProjectIds = new Set(projects.map((p: any) => p.id))

    if (parsed.assigneeId && !validMemberIds.has(parsed.assigneeId)) {
      parsed.assigneeId = null
      parsed.assigneeName = null
      parsed.assigneeReason = null
    }
    if (parsed.projectId && !validProjectIds.has(parsed.projectId)) {
      parsed.projectId = null
      parsed.projectName = null
    }
    if (parsed.statusId && !validStatusIds.has(parsed.statusId)) {
      parsed.statusId = null
    }

    return parsed
  } catch (error: any) {
    console.error('AI task creation assist error:', error)
    return {
      title: body.description || '',
      description: '',
      priority: 'medium',
      assigneeId: null,
      assigneeName: null,
      assigneeReason: null,
      projectId: null,
      projectName: null,
      dueDate: null,
      startDate: null,
      estimatedHours: null,
      statusId: null,
      confidence: 0,
      suggestions: ['AI assistance is temporarily unavailable. Please fill in the fields manually.']
    }
  }
})
