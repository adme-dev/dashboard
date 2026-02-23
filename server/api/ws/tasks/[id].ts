/**
 * WebSocket endpoint for task real-time updates
 * Connects to Cloudflare Durable Object
 * 
 * URL: /api/ws/tasks/:taskId?userId=xxx&userName=xxx
 */

import { getRouterParam, getQuery } from 'h3'

export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'id')
  const query = getQuery(event)
  
  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: 'Task ID required' })
  }

  // In development (Node.js), return a mock response
  // In production (Cloudflare Workers), this would be handled by the Durable Object
  if (process.dev) {
    return {
      message: 'WebSocket endpoint',
      taskId,
      note: 'Durable Objects only work in Cloudflare Workers environment'
    }
  }

  // Production: Cloudflare Workers environment
  // The actual WebSocket upgrade is handled by the Durable Object
  // This endpoint just needs to exist for the routing
  
  return {
    message: 'Connect via WebSocket',
    taskId,
    url: `/api/ws/tasks/${taskId}?userId=${query.userId}&userName=${query.userName}`
  }
})
