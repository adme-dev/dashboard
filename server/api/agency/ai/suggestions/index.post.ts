/**
 * Generate Task Suggestions for Project
 * POST /api/agency/ai/suggestions
 *
 * Uses AI to suggest additional tasks for an existing project
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface SuggestionsBody {
  projectId: string
  contextType: 'scope_expansion' | 'risk_mitigation' | 'optimization' | 'missing_tasks' | 'resource_reallocation'
  additionalContext?: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<SuggestionsBody>(event)

  // Validation
  if (!body.projectId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project ID is required'
    })
  }

  if (!body.contextType) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Context type is required'
    })
  }

  try {
    // Get project details
    const project = await queryOne(`
      SELECT
        p.*,
        c.name AS client_name,
        ps.name AS status_name
      FROM projects p
      LEFT JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN project_statuses ps ON p.status_id = ps.id
      WHERE p.id = $1
    `, [body.projectId])

    if (!project) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Project not found'
      })
    }

    // Get existing tasks
    const existingTasks = await queryRows(`
      SELECT name, description, estimated_hours, priority
      FROM tasks
      WHERE project_id = $1
    `, [body.projectId])

    // In a real implementation, this would call an AI API
    // For now, generate suggestions based on context type

    let suggestedTasks: any[] = []
    let aiReasoning = ''

    switch (body.contextType) {
      case 'scope_expansion':
        suggestedTasks = [
          {
            name: 'Extended Documentation',
            description: 'Create comprehensive documentation for the project deliverables',
            estimatedHours: 8,
            priority: 'normal',
            rationale: 'Documentation ensures long-term maintainability and knowledge transfer'
          },
          {
            name: 'Training Session',
            description: 'Conduct training session for client team on new features/deliverables',
            estimatedHours: 4,
            priority: 'normal',
            rationale: 'Ensures client can effectively use and maintain the deliverables'
          }
        ]
        aiReasoning = 'Based on the project scope, additional documentation and training would enhance the overall value delivered.'
        break

      case 'risk_mitigation':
        suggestedTasks = [
          {
            name: 'Contingency Planning',
            description: 'Develop contingency plans for identified project risks',
            estimatedHours: 4,
            priority: 'high',
            rationale: 'Proactive risk management reduces project delays and budget overruns'
          },
          {
            name: 'Additional QA Review',
            description: 'Implement additional quality assurance checkpoints',
            estimatedHours: 8,
            priority: 'high',
            rationale: 'Early detection of issues reduces rework costs'
          }
        ]
        aiReasoning = 'Adding risk mitigation tasks will help prevent potential issues and ensure smoother project delivery.'
        break

      case 'optimization':
        suggestedTasks = [
          {
            name: 'Performance Optimization Review',
            description: 'Review and optimize performance of delivered components',
            estimatedHours: 6,
            priority: 'normal',
            rationale: 'Performance optimization improves user experience and system efficiency'
          },
          {
            name: 'Process Improvement Session',
            description: 'Identify and implement process improvements based on project learnings',
            estimatedHours: 3,
            priority: 'low',
            rationale: 'Continuous improvement benefits future projects'
          }
        ]
        aiReasoning = 'Optimization tasks will improve the quality and efficiency of project deliverables.'
        break

      case 'missing_tasks':
        suggestedTasks = [
          {
            name: 'Stakeholder Review Meeting',
            description: 'Schedule and conduct review meeting with key stakeholders',
            estimatedHours: 2,
            priority: 'high',
            rationale: 'Regular stakeholder alignment prevents misunderstandings and scope creep'
          },
          {
            name: 'Acceptance Criteria Documentation',
            description: 'Document detailed acceptance criteria for all deliverables',
            estimatedHours: 4,
            priority: 'high',
            rationale: 'Clear acceptance criteria ensure deliverables meet client expectations'
          },
          {
            name: 'Post-Launch Support Planning',
            description: 'Plan for post-launch support and maintenance',
            estimatedHours: 2,
            priority: 'normal',
            rationale: 'Proactive support planning ensures smooth transition to maintenance phase'
          }
        ]
        aiReasoning = `Based on analysis of ${existingTasks.length} existing tasks, these additional tasks would help ensure project completeness.`
        break

      case 'resource_reallocation':
        suggestedTasks = [
          {
            name: 'Resource Capacity Review',
            description: 'Review and reallocate resources based on current progress and upcoming milestones',
            estimatedHours: 2,
            priority: 'high',
            rationale: 'Optimal resource allocation improves efficiency and prevents bottlenecks'
          },
          {
            name: 'Skills Gap Assessment',
            description: 'Identify any skills gaps and plan for training or additional resources',
            estimatedHours: 3,
            priority: 'normal',
            rationale: 'Addressing skills gaps early prevents delays in specialized tasks'
          }
        ]
        aiReasoning = 'Resource reallocation tasks will help optimize team utilization and project efficiency.'
        break
    }

    // Create suggestion record
    const suggestion = await queryOne(`
      INSERT INTO ai_task_suggestions (
        project_id,
        generated_by,
        context_type,
        trigger_reason,
        suggested_tasks,
        ai_confidence,
        ai_reasoning,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *
    `, [
      body.projectId,
      user.id,
      body.contextType,
      body.additionalContext || `AI-generated ${body.contextType} suggestions`,
      JSON.stringify(suggestedTasks),
      75, // Default confidence
      aiReasoning
    ])

    return {
      success: true,
      suggestion: {
        id: suggestion.id,
        projectId: suggestion.project_id,
        contextType: suggestion.context_type,
        status: suggestion.status,
        confidence: suggestion.ai_confidence,
        reasoning: suggestion.ai_reasoning,
        tasks: suggestedTasks,
        createdAt: suggestion.created_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to generate task suggestions:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to generate task suggestions'
    })
  }
})
