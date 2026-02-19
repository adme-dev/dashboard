/**
 * Create Project Template
 * POST /api/agency/ai/templates
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface Phase {
  name: string
  duration_days?: number
  deliverables?: string[]
}

interface DefaultTask {
  name: string
  phase?: string
  hours?: number
  required_skills?: string[]
}

interface DiscoveryQuestion {
  question: string
  type: 'text' | 'number' | 'boolean' | 'date' | 'select'
  required?: boolean
  options?: string[]
}

interface CreateTemplateBody {
  name: string
  description?: string
  category?: string
  defaultProjectType?: string
  estimatedDurationDays?: number
  estimatedBudgetMin?: number
  estimatedBudgetMax?: number
  phases?: Phase[]
  defaultTasks?: DefaultTask[]
  requiredSkills?: string[]
  recommendedTeamSize?: number
  discoveryQuestions?: DiscoveryQuestion[]
  aiContext?: string
  isActive?: boolean
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<CreateTemplateBody>(event)

  // Validation
  if (!body.name?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Template name is required'
    })
  }

  try {
    const template = await queryOne(`
      INSERT INTO project_templates (
        name,
        description,
        category,
        default_project_type,
        estimated_duration_days,
        estimated_budget_min,
        estimated_budget_max,
        phases,
        default_tasks,
        required_skills,
        recommended_team_size,
        discovery_questions,
        ai_context,
        is_active,
        is_system,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, false, $15)
      RETURNING *
    `, [
      body.name.trim(),
      body.description || null,
      body.category || null,
      body.defaultProjectType || null,
      body.estimatedDurationDays || null,
      body.estimatedBudgetMin || null,
      body.estimatedBudgetMax || null,
      JSON.stringify(body.phases || []),
      JSON.stringify(body.defaultTasks || []),
      JSON.stringify(body.requiredSkills || []),
      body.recommendedTeamSize || null,
      JSON.stringify(body.discoveryQuestions || []),
      body.aiContext || null,
      body.isActive ?? true,
      user.id
    ])

    return {
      success: true,
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        defaultProjectType: template.default_project_type,
        estimatedDuration: template.estimated_duration_days,
        estimatedBudget: {
          min: template.estimated_budget_min,
          max: template.estimated_budget_max
        },
        phases: template.phases,
        defaultTasks: template.default_tasks,
        requiredSkills: template.required_skills,
        recommendedTeamSize: template.recommended_team_size,
        discoveryQuestions: template.discovery_questions,
        isActive: template.is_active,
        createdAt: template.created_at
      }
    }
  } catch (error) {
    console.error('Failed to create project template:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create project template'
    })
  }
})
