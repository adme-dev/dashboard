/**
 * POST /api/agency/invoicing/classify
 * Classify a job description into COA code, GST type, and tracking category.
 *
 * Body: { description: string }
 * Returns: { coa, gst, confidence }
 *
 * Uses the static ADME business rules (COA mapping + GST classification engine).
 * No Xero API call needed — this is pure business logic.
 */
import { createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { mapToAccountWithConfidence } from '~~/server/utils/invoicing/coa-map'
import { classifyGST } from '~~/server/utils/invoicing/gst-rules'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const description = body?.description

  if (!description || typeof description !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing required field: description' })
  }

  const coa = mapToAccountWithConfidence(description)
  const gst = classifyGST(description, coa.code)

  return {
    coa: {
      code: coa.code,
      category: coa.category,
      tracking: coa.tracking,
      margin: coa.margin,
      matchedKeyword: coa.matchedKeyword,
    },
    gst: {
      taxType: gst.taxType,
      xeroCode: gst.xeroCode,
      gstRate: gst.gstRate,
      reason: gst.reason,
      riskLevel: gst.riskLevel,
    },
    confidence: coa.confidence,
  }
})
