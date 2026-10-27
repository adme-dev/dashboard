import { defineEventHandler, getRequestURL, setHeader } from 'h3'

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  if (path === '/api/agency/banner-studio/dissect' || path.startsWith('/api/agency/banner-studio/dissect/')) {
    // Includes errors, polls, history and import receipts, not only image bodies.
    setHeader(event, 'Cache-Control', 'private, no-store')
    setHeader(event, 'X-Content-Type-Options', 'nosniff')
  }
})
