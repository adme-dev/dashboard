/**
 * Client Portal - Notifications
 * GET /api/portal/notifications
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

type NotificationSummaryRow = {
  total: string | number | null
  unread: string | number | null
  recent: string | number | null
  unread_approvals: string | number | null
  unread_billing: string | number | null
  unread_deliverables: string | number | null
  unread_projects: string | number | null
  latest_at: string | null
}

const toNumber = (value: string | number | null | undefined) => Number(value || 0)

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const query = getQuery(event)

  const unreadOnly = query.unreadOnly === 'true'
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    const conditions: string[] = ['cn.client_user_id = $1', 'cn.is_archived = false']
    const params: unknown[] = [clientUser.id]
    const idx = 2

    if (unreadOnly) {
      conditions.push('cn.is_read = false')
    }

    params.push(limit)

    const notifications = await queryRows(`
      SELECT
        cn.id,
        cn.type,
        cn.title,
        cn.message,
        cn.action_url,
        cn.is_read,
        cn.read_at,
        cn.created_at,
        p.id as project_id,
        p.name as project_name,
        ca.id as approval_id,
        cd.id as deliverable_id,
        i.id as invoice_id,
        i.invoice_number
      FROM client_notifications cn
      LEFT JOIN projects p ON cn.project_id = p.id
      LEFT JOIN client_approvals ca ON cn.approval_id = ca.id
      LEFT JOIN client_deliverables cd ON cn.deliverable_id = cd.id
      LEFT JOIN invoices i ON cn.invoice_id = i.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY cn.created_at DESC
      LIMIT $${idx}
    `, params)

    const unreadCount = await queryOne(`
      SELECT COUNT(*) as count
      FROM client_notifications
      WHERE client_user_id = $1 AND is_read = false AND is_archived = false
    `, [clientUser.id])

    const summary = await queryOne<NotificationSummaryRow>(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE is_read = false) AS unread,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS recent,
        COUNT(*) FILTER (
          WHERE is_read = false
            AND type IN ('approval_requested', 'approval_responded')
        ) AS unread_approvals,
        COUNT(*) FILTER (
          WHERE is_read = false
            AND type IN ('invoice_sent', 'invoice_overdue')
        ) AS unread_billing,
        COUNT(*) FILTER (
          WHERE is_read = false
            AND type IN ('deliverable_published', 'comment_added', 'comment_reply')
        ) AS unread_deliverables,
        COUNT(*) FILTER (
          WHERE is_read = false
            AND type IN ('project_updated', 'status_change')
        ) AS unread_projects,
        MAX(created_at) AS latest_at
      FROM client_notifications
      WHERE client_user_id = $1
        AND is_archived = false
    `, [clientUser.id])

    return {
      notifications: notifications.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        actionUrl: n.action_url,
        isRead: n.is_read,
        readAt: n.read_at,
        createdAt: n.created_at,
        project: n.project_id ? { id: n.project_id, name: n.project_name } : null,
        approvalId: n.approval_id,
        deliverableId: n.deliverable_id,
        invoice: n.invoice_id ? { id: n.invoice_id, number: n.invoice_number } : null
      })),
      unreadCount: Number(unreadCount?.count || 0),
      summary: {
        total: toNumber(summary?.total),
        unread: toNumber(summary?.unread),
        recent: toNumber(summary?.recent),
        unreadApprovals: toNumber(summary?.unread_approvals),
        unreadBilling: toNumber(summary?.unread_billing),
        unreadDeliverables: toNumber(summary?.unread_deliverables),
        unreadProjects: toNumber(summary?.unread_projects),
        latestAt: summary?.latest_at || null
      }
    }
  } catch (error) {
    console.error('Failed to fetch notifications:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch notifications' })
  }
})
