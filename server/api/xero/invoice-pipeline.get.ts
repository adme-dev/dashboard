import { createError } from 'h3'
import { createXeroClient } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'

function ensureDateString(d: Date) {
  return d.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function daysBetween(date1: Date, date2: Date) {
  const diffTime = Math.abs(date2.getTime() - date1.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

function dtExpr(d: Date) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `DateTime(${y},${m},${day})`
}

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const query = getQuery(event)
  const daysBack = Number(query.days) || 90
  const includeDetails = query.details === 'true'

  const today = new Date()
  const startDate = addDays(today, -daysBack)

  const client = await createXeroClient({ tokenSet: token })

  // Fetch invoices across all statuses
  const invoiceStatuses = ['DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED']
  
  const invoicePromises = invoiceStatuses.map(async (status) => {
    try {
      const { body } = await client.accountingApi.getInvoices(
        tenantId,
        undefined,
        `Type=="ACCREC"&&Status=="${status}"&&Date>=${dtExpr(startDate)}`,
        'Date DESC',
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        undefined,
        undefined,
        undefined,
        500
      )
      return {
        status,
        invoices: body?.invoices || []
      }
    } catch (err) {
      console.warn(`Failed to fetch ${status} invoices:`, err)
      return {
        status,
        invoices: []
      }
    }
  })

  const invoiceResults = await Promise.all(invoicePromises)
  const allInvoices = invoiceResults.flatMap(result => 
    result.invoices.map(inv => ({ ...inv, status: result.status }))
  )

  // Process pipeline stages
  const pipelineStages = {
    draft: {
      name: 'Draft',
      count: 0,
      value: 0,
      invoices: [],
      averageDaysInStage: 0,
      color: '#94a3b8' // slate-400
    },
    submitted: {
      name: 'Submitted',
      count: 0,
      value: 0,
      invoices: [],
      averageDaysInStage: 0,
      color: '#3b82f6' // blue-500
    },
    authorised: {
      name: 'Authorised',
      count: 0,
      value: 0,
      invoices: [],
      averageDaysInStage: 0,
      color: '#f59e0b' // amber-500
    },
    overdue: {
      name: 'Overdue',
      count: 0,
      value: 0,
      invoices: [],
      averageDaysInStage: 0,
      color: '#ef4444' // red-500
    },
    paid: {
      name: 'Paid',
      count: 0,
      value: 0,
      invoices: [],
      averageDaysInStage: 0,
      color: '#10b981' // emerald-500
    }
  }

  // Categorize invoices and calculate metrics
  for (const invoice of allInvoices) {
    const amount = Number(invoice.total) || 0
    const amountDue = Number(invoice.amountDue) || 0
    const invoiceDate = new Date(invoice.date || today)
    const dueDate = new Date(invoice.dueDate || today)
    const daysOld = daysBetween(invoiceDate, today)
    const daysPastDue = invoice.status === 'AUTHORISED' ? daysBetween(dueDate, today) : 0

    const invoiceData = {
      id: invoice.invoiceID,
      number: invoice.invoiceNumber,
      contact: invoice.contact?.name || 'Unknown',
      date: ensureDateString(invoiceDate),
      dueDate: ensureDateString(dueDate),
      amount,
      amountDue,
      amountPaid: amount - amountDue,
      daysOld,
      daysPastDue,
      status: invoice.status,
      reference: invoice.reference
    }

    // Categorize into pipeline stages
    if (invoice.status === 'DRAFT') {
      pipelineStages.draft.count++
      pipelineStages.draft.value += amount
      pipelineStages.draft.invoices.push(invoiceData)
    } else if (invoice.status === 'SUBMITTED') {
      pipelineStages.submitted.count++
      pipelineStages.submitted.value += amount
      pipelineStages.submitted.invoices.push(invoiceData)
    } else if (invoice.status === 'AUTHORISED') {
      if (daysPastDue > 0) {
        pipelineStages.overdue.count++
        pipelineStages.overdue.value += amountDue
        pipelineStages.overdue.invoices.push(invoiceData)
      } else {
        pipelineStages.authorised.count++
        pipelineStages.authorised.value += amountDue
        pipelineStages.authorised.invoices.push(invoiceData)
      }
    } else if (invoice.status === 'PAID') {
      pipelineStages.paid.count++
      pipelineStages.paid.value += amount
      pipelineStages.paid.invoices.push(invoiceData)
    }
  }

  // Calculate average days in each stage
  Object.keys(pipelineStages).forEach(stageKey => {
    const stage = pipelineStages[stageKey]
    if (stage.invoices.length > 0) {
      const totalDays = stage.invoices.reduce((sum, inv) => {
        return sum + (stageKey === 'overdue' ? inv.daysPastDue : inv.daysOld)
      }, 0)
      stage.averageDaysInStage = Math.round(totalDays / stage.invoices.length)
    }
  })

  // Calculate conversion rates and pipeline health
  const totalValue = Object.values(pipelineStages).reduce((sum, stage) => sum + stage.value, 0)
  const paidRate = totalValue > 0 ? (pipelineStages.paid.value / totalValue) * 100 : 0
  const overdueRate = totalValue > 0 ? (pipelineStages.overdue.value / totalValue) * 100 : 0
  
  // Calculate average collection time (for paid invoices)
  const paidInvoices = pipelineStages.paid.invoices
  const averageCollectionTime = paidInvoices.length > 0 
    ? paidInvoices.reduce((sum, inv) => sum + inv.daysOld, 0) / paidInvoices.length
    : 0

  // Identify bottlenecks
  const bottlenecks = []
  if (pipelineStages.draft.count > 10) {
    bottlenecks.push({ stage: 'draft', issue: 'Too many draft invoices', count: pipelineStages.draft.count })
  }
  if (pipelineStages.authorised.averageDaysInStage > 30) {
    bottlenecks.push({ stage: 'authorised', issue: 'Long payment cycles', days: pipelineStages.authorised.averageDaysInStage })
  }
  if (overdueRate > 15) {
    bottlenecks.push({ stage: 'overdue', issue: 'High overdue rate', rate: overdueRate })
  }

  // Generate pipeline flow data for visualization
  const flowData = [
    { from: 'prospects', to: 'draft', value: pipelineStages.draft.count },
    { from: 'draft', to: 'submitted', value: pipelineStages.submitted.count },
    { from: 'submitted', to: 'authorised', value: pipelineStages.authorised.count },
    { from: 'authorised', to: 'paid', value: pipelineStages.paid.count },
    { from: 'authorised', to: 'overdue', value: pipelineStages.overdue.count }
  ].filter(flow => flow.value > 0)

  // Calculate velocity metrics
  const weeklyPaidValue = paidInvoices
    .filter(inv => daysBetween(new Date(inv.date), today) <= 7)
    .reduce((sum, inv) => sum + inv.amount, 0)
  
  const monthlyPaidValue = paidInvoices
    .filter(inv => daysBetween(new Date(inv.date), today) <= 30)
    .reduce((sum, inv) => sum + inv.amount, 0)

  // Risk assessment
  const riskFactors = []
  if (overdueRate > 20) riskFactors.push('High overdue rate')
  if (averageCollectionTime > 45) riskFactors.push('Slow collection cycle')
  if (pipelineStages.draft.count > pipelineStages.paid.count) riskFactors.push('Pipeline backing up')
  
  const riskLevel = riskFactors.length >= 2 ? 'high' : riskFactors.length === 1 ? 'medium' : 'low'

  return {
    asOfDate: ensureDateString(today),
    period: {
      from: ensureDateString(startDate),
      to: ensureDateString(today),
      days: daysBack
    },

    // Pipeline overview
    summary: {
      totalInvoices: allInvoices.length,
      totalValue: Math.round(totalValue * 100) / 100,
      paidValue: Math.round(pipelineStages.paid.value * 100) / 100,
      outstandingValue: Math.round((pipelineStages.authorised.value + pipelineStages.overdue.value) * 100) / 100,
      paidRate: Math.round(paidRate * 100) / 100,
      overdueRate: Math.round(overdueRate * 100) / 100,
      averageCollectionTime: Math.round(averageCollectionTime),
      riskLevel
    },

    // Pipeline stages with detailed metrics
    stages: Object.fromEntries(
      Object.entries(pipelineStages).map(([key, stage]) => [
        key,
        {
          ...stage,
          value: Math.round(stage.value * 100) / 100,
          percentage: totalValue > 0 ? Math.round((stage.value / totalValue) * 100 * 100) / 100 : 0,
          invoices: includeDetails ? stage.invoices : stage.invoices.slice(0, 5)
        }
      ])
    ),

    // Performance metrics
    metrics: {
      weeklyPaidValue: Math.round(weeklyPaidValue * 100) / 100,
      monthlyPaidValue: Math.round(monthlyPaidValue * 100) / 100,
      averageInvoiceValue: allInvoices.length > 0 ? Math.round((totalValue / allInvoices.length) * 100) / 100 : 0,
      collectionEfficiency: 100 - overdueRate,
      pipelineVelocity: averageCollectionTime > 0 ? Math.round((30 / averageCollectionTime) * 100) / 100 : 0
    },

    // Bottlenecks and issues
    bottlenecks,
    riskFactors,

    // Visualization data
    flowData,

    // Actionable insights
    insights: [
      ...(bottlenecks.length > 0 ? [`${bottlenecks.length} pipeline bottleneck(s) identified`] : []),
      ...(overdueRate > 10 ? [`${overdueRate.toFixed(1)}% of invoice value is overdue`] : []),
      ...(averageCollectionTime > 30 ? [`Average collection time is ${averageCollectionTime.toFixed(0)} days`] : []),
      ...(pipelineStages.draft.count > 5 ? [`${pipelineStages.draft.count} invoices in draft status`] : [])
    ],

    // Recommendations
    recommendations: [
      ...(pipelineStages.draft.count > 10 ? ['Review and send draft invoices'] : []),
      ...(overdueRate > 15 ? ['Implement automated payment reminders'] : []),
      ...(averageCollectionTime > 45 ? ['Review payment terms and collection processes'] : []),
      ...(pipelineStages.overdue.count > 5 ? ['Focus on overdue invoice collection'] : []),
      ...(paidRate < 70 ? ['Analyze and improve invoice conversion rates'] : [])
    ]
  }
})
