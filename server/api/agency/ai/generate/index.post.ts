/**
 * Generate Project with AI
 * POST /api/agency/ai/generate
 *
 * Creates an AI generation session and returns generated project structure
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface GenerateProjectBody {
  templateId?: string
  clientId?: string
  intakeSubmissionId?: string
  projectName: string
  projectDescription: string
  clientRequirements?: string
  targetBudget?: number
  targetDeadline?: string
  discoveryAnswers?: Record<string, any>
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<GenerateProjectBody>(event)

  // Validation
  if (!body.projectName?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project name is required'
    })
  }

  if (!body.projectDescription?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project description is required'
    })
  }

  try {
    // Get template if provided
    let template = null
    if (body.templateId) {
      template = await queryOne(`
        SELECT * FROM project_templates WHERE id = $1 AND is_active = true
      `, [body.templateId])

      if (!template) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Template not found'
        })
      }
    }

    // Validate client exists if provided
    if (body.clientId) {
      const clientExists = await queryOne(`
        SELECT id FROM agency_clients WHERE id = $1
      `, [body.clientId])
      if (!clientExists) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Client not found'
        })
      }
    }

    // Create generation session
    const session = await queryOne(`
      INSERT INTO ai_generation_sessions (
        created_by,
        template_id,
        client_id,
        intake_submission_id,
        project_name,
        project_description,
        client_requirements,
        target_budget,
        target_deadline,
        discovery_answers,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'generating')
      RETURNING *
    `, [
      user.id,
      body.templateId || null,
      body.clientId || null,
      body.intakeSubmissionId || null,
      body.projectName.trim(),
      body.projectDescription.trim(),
      body.clientRequirements || null,
      body.targetBudget || null,
      body.targetDeadline || null,
      JSON.stringify(body.discoveryAnswers || {})
    ])

    // In a real implementation, this would call an AI API (OpenAI, Claude, etc.)
    // For now, we generate a project based on the template or generic structure

    let generatedProject: any

    if (template) {
      // Generate based on template
      const phases = template.phases as any[]
      const defaultTasks = template.default_tasks as any[]

      // Calculate timeline based on target deadline or template duration
      const startDate = new Date()
      let totalDays = template.estimated_duration_days || 30

      if (body.targetDeadline) {
        const deadline = new Date(body.targetDeadline)
        const diffTime = deadline.getTime() - startDate.getTime()
        totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      }

      // Scale phases to fit timeline
      const templateTotalDays = phases.reduce((sum, p) => sum + (p.duration_days || 0), 0) || totalDays
      const scaleFactor = totalDays / templateTotalDays

      let currentDate = new Date(startDate)
      const scaledPhases = phases.map((phase: any) => {
        const phaseDays = Math.round((phase.duration_days || 7) * scaleFactor)
        const phaseStart = new Date(currentDate)
        currentDate.setDate(currentDate.getDate() + phaseDays)
        const phaseEnd = new Date(currentDate)

        return {
          name: phase.name,
          startDate: phaseStart.toISOString().split('T')[0],
          endDate: phaseEnd.toISOString().split('T')[0],
          durationDays: phaseDays,
          deliverables: phase.deliverables || []
        }
      })

      // Generate tasks based on template
      const generatedTasks = defaultTasks.map((task: any, index: number) => {
        const phase = scaledPhases.find(p => p.name === task.phase) || scaledPhases[0]
        return {
          id: `task-${index + 1}`,
          name: task.name,
          phase: task.phase,
          estimatedHours: task.hours || 8,
          requiredSkills: task.required_skills || [],
          priority: index < 3 ? 'high' : 'normal',
          suggestedStartDate: phase?.startDate,
          rationale: `Part of ${task.phase || 'project'} phase`
        }
      })

      // Calculate budget
      const totalHours = generatedTasks.reduce((sum, t) => sum + t.estimatedHours, 0)
      const estimatedBudget = body.targetBudget || (totalHours * 150) // $150/hr default

      generatedProject = {
        name: body.projectName,
        description: body.projectDescription,
        clientId: body.clientId,
        projectType: template.default_project_type || 'fixed',
        estimatedBudget,
        estimatedHours: totalHours,
        startDate: startDate.toISOString().split('T')[0],
        endDate: scaledPhases[scaledPhases.length - 1]?.endDate,
        phases: scaledPhases,
        tasks: generatedTasks,
        milestones: scaledPhases.map((p, i) => ({
          name: `${p.name} Complete`,
          dueDate: p.endDate,
          deliverables: p.deliverables
        })),
        resourceRecommendations: {
          teamSize: template.recommended_team_size || 3,
          skills: template.required_skills || [],
          notes: `Based on ${template.name} template`
        },
        aiConfidence: 85,
        aiReasoning: `Generated based on "${template.name}" template with ${totalDays} day timeline and $${estimatedBudget.toLocaleString()} budget.`
      }
    } else {
      // Generate generic project structure
      const totalDays = body.targetDeadline
        ? Math.ceil((new Date(body.targetDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : 30

      const startDate = new Date()

      generatedProject = {
        name: body.projectName,
        description: body.projectDescription,
        clientId: body.clientId,
        projectType: 'fixed',
        estimatedBudget: body.targetBudget || 25000,
        estimatedHours: Math.round(totalDays * 4), // Rough estimate
        startDate: startDate.toISOString().split('T')[0],
        endDate: body.targetDeadline || new Date(startDate.getTime() + totalDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        phases: [
          { name: 'Discovery', durationDays: Math.round(totalDays * 0.2), deliverables: ['Project Brief', 'Requirements'] },
          { name: 'Execution', durationDays: Math.round(totalDays * 0.6), deliverables: ['Deliverables'] },
          { name: 'Review', durationDays: Math.round(totalDays * 0.2), deliverables: ['Final Delivery'] }
        ],
        tasks: [
          { id: 'task-1', name: 'Project Kickoff', phase: 'Discovery', estimatedHours: 2, priority: 'high' },
          { id: 'task-2', name: 'Requirements Gathering', phase: 'Discovery', estimatedHours: 8, priority: 'high' },
          { id: 'task-3', name: 'Main Work', phase: 'Execution', estimatedHours: Math.round(totalDays * 3), priority: 'high' },
          { id: 'task-4', name: 'Review & Revisions', phase: 'Review', estimatedHours: 8, priority: 'normal' },
          { id: 'task-5', name: 'Final Delivery', phase: 'Review', estimatedHours: 4, priority: 'high' }
        ],
        milestones: [
          { name: 'Discovery Complete', dueDate: null, deliverables: ['Brief approved'] },
          { name: 'Project Complete', dueDate: body.targetDeadline, deliverables: ['All deliverables'] }
        ],
        resourceRecommendations: {
          teamSize: 2,
          skills: ['project_management'],
          notes: 'Generic project structure - customize based on specific needs'
        },
        aiConfidence: 60,
        aiReasoning: 'Generated generic project structure. Consider using a template for more accurate estimates.'
      }
    }

    // Update session with generated project
    await queryOne(`
      UPDATE ai_generation_sessions
      SET
        status = 'completed',
        generated_project = $1,
        ai_tokens_used = $2,
        completed_at = NOW()
      WHERE id = $3
    `, [JSON.stringify(generatedProject), 500, session.id])

    return {
      success: true,
      session: {
        id: session.id,
        status: 'completed'
      },
      generatedProject
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to generate project:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to generate project'
    })
  }
})
