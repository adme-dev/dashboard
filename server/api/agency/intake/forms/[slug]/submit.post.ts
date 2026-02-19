/**
 * Submit Intake Form (Public - No Auth Required)
 * POST /api/agency/intake/forms/:slug/submit
 */

import { queryOne, queryRows } from '~~/server/utils/db'

interface SubmitFormBody {
  name: string
  email: string
  phone?: string
  company?: string
  data: Record<string, any>
  source?: string
  clientId?: string
}

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Form slug is required'
    })
  }

  const body = await readBody<SubmitFormBody>(event)

  if (!body.email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email is required'
    })
  }

  if (!body.data || typeof body.data !== 'object') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Form data is required'
    })
  }

  try {
    // Get form
    const form = await queryOne(`
      SELECT
        f.id,
        f.name,
        f.is_active,
        f.is_public,
        f.auto_create_project,
        f.auto_project_template_id,
        f.confirmation_message,
        f.confirmation_redirect_url,
        f.notify_on_submission,
        f.default_department_id
      FROM intake_forms f
      WHERE f.slug = $1
    `, [slug])

    if (!form) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Form not found'
      })
    }

    if (!form.is_active) {
      throw createError({
        statusCode: 410,
        statusMessage: 'This form is no longer accepting submissions'
      })
    }

    // Get form fields for validation
    const fields = await queryRows(`
      SELECT field_key, label, field_type, is_required, min_length, max_length, pattern
      FROM intake_form_fields
      WHERE form_id = $1
    `, [form.id])

    // Validate required fields
    const errors: string[] = []
    for (const field of fields) {
      if (field.is_required) {
        const value = body.data[field.field_key]
        if (value === undefined || value === null || value === '') {
          errors.push(`${field.label} is required`)
        }
      }

      // Additional validation
      const value = body.data[field.field_key]
      if (value) {
        if (field.min_length && String(value).length < field.min_length) {
          errors.push(`${field.label} must be at least ${field.min_length} characters`)
        }
        if (field.max_length && String(value).length > field.max_length) {
          errors.push(`${field.label} must be no more than ${field.max_length} characters`)
        }
        if (field.pattern) {
          const regex = new RegExp(field.pattern)
          if (!regex.test(String(value))) {
            errors.push(`${field.label} format is invalid`)
          }
        }
      }
    }

    if (errors.length > 0) {
      throw createError({
        statusCode: 400,
        statusMessage: errors.join(', ')
      })
    }

    // Get request metadata
    const headers = getHeaders(event)
    const ipAddress = headers['x-forwarded-for'] || headers['x-real-ip'] || 'unknown'
    const userAgent = headers['user-agent'] || null
    const referrer = headers['referer'] || null

    // Check if client exists by email
    let clientId = body.clientId || null
    if (!clientId && body.company) {
      const existingClient = await queryOne(`
        SELECT id FROM agency_clients WHERE name ILIKE $1
      `, [body.company])
      if (existingClient) {
        clientId = existingClient.id
      }
    }

    // Create submission
    const submission = await queryOne(`
      INSERT INTO intake_submissions (
        form_id,
        client_id,
        submitted_by_name,
        submitted_by_email,
        submitted_by_phone,
        submitted_by_company,
        data,
        status,
        priority,
        source,
        referrer_url,
        ip_address,
        user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 'normal', $8, $9, $10, $11)
      RETURNING *
    `, [
      form.id,
      clientId,
      body.name || null,
      body.email,
      body.phone || null,
      body.company || null,
      JSON.stringify(body.data),
      body.source || 'direct',
      referrer,
      ipAddress,
      userAgent
    ])

    // Log activity
    await queryOne(`
      INSERT INTO intake_submission_activities (
        submission_id,
        activity_type,
        new_value
      ) VALUES ($1, 'created', $2)
    `, [submission.id, body.email])

    // TODO: Send notifications to notify_on_submission users
    // This would use the notifications utility

    return {
      success: true,
      submissionId: submission.id,
      message: form.confirmation_message || 'Thank you for your submission.',
      redirectUrl: form.confirmation_redirect_url
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to submit form:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to submit form'
    })
  }
})
