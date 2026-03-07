/**
 * Task Pricing Utilities
 * Rate hierarchy resolution: task.billing_rate → rate card match → default
 */

import { queryOne } from '~~/server/utils/db'

const DEFAULT_RATE = 150 // AUD

export async function resolveEffectiveRate(task: {
  billing_rate?: number | null
  task_type?: string | null
}): Promise<{ rate: number; source: 'task' | 'rate_card' | 'default' }> {
  // 1. Task-level override
  if (task.billing_rate != null && Number(task.billing_rate) > 0) {
    return { rate: Number(task.billing_rate), source: 'task' }
  }

  // 2. Rate card match by task_type
  if (task.task_type) {
    try {
      const escaped = String(task.task_type).replace(/%/g, '\\%').replace(/_/g, '\\_').toLowerCase()
      const match = await queryOne(`
        SELECT price FROM rate_card_items
        WHERE LOWER(service_name) LIKE $1
          AND is_active = true
        ORDER BY updated_at DESC
        LIMIT 1
      `, [`%${escaped}%`])

      if (match?.price) {
        return { rate: Number(match.price), source: 'rate_card' }
      }
    } catch {
      // Rate card table may not exist, fall through
    }
  }

  // 3. Default rate
  return { rate: DEFAULT_RATE, source: 'default' }
}
