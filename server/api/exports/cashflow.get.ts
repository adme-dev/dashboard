import { createError } from 'h3'
import { $fetch } from 'ofetch'

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const format = String(query.format || 'json') // json, csv, excel
  const period = String(query.period || '90')
  const includeScenarios = query.scenarios === 'true'
  const includeWaterfall = query.waterfall === 'true'

  try {
    // Fetch all cash flow data
    const [forecast, scenarios, waterfall, invoices] = await Promise.all([
      $fetch(`/api/xero/reports/cash-flow-forecast?days=${period}`, { headers: event.headers }),
      includeScenarios ? $fetch(`/api/xero/reports/cash-flow-scenarios?days=${period}`, { headers: event.headers }) : null,
      includeWaterfall ? $fetch(`/api/xero/reports/cash-flow-waterfall?period=30`, { headers: event.headers }) : null,
      $fetch('/api/xero/invoices', { headers: event.headers })
    ])

    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        period: `${period} days`,
        format,
        includeScenarios,
        includeWaterfall
      },
      summary: {
        currentCash: forecast.currentCash,
        projectedEndBalance: forecast.projectedEndBalance,
        minProjectedBalance: forecast.minProjectedBalance,
        maxProjectedBalance: forecast.maxProjectedBalance,
        dailyBurnRate: forecast.dailyBurnRate,
        shortfallDates: forecast.shortfallDates,
        forecastPeriod: forecast.forecastPeriod
      },
      forecast: forecast.forecast || [],
      dailyForecast: forecast.dailyForecast || [],
      receivables: {
        outstanding: invoices.outstanding || [],
        overdue: invoices.overdue || [],
        totals: {
          outstanding: (invoices.outstanding || []).reduce((sum: number, inv: any) => sum + (inv.amountDue || 0), 0),
          overdue: (invoices.overdue || []).reduce((sum: number, inv: any) => sum + (inv.amountDue || 0), 0)
        }
      },
      ...(scenarios && { scenarios }),
      ...(waterfall && { waterfall })
    }

    if (format === 'csv') {
      // Generate CSV format
      const csvRows = []
      
      // Header
      csvRows.push('Date,Balance,Inflows,Outflows,Net Change')
      
      // Data rows
      for (const item of exportData.dailyForecast) {
        csvRows.push(`${item.date},${item.balance},${item.inflows},${item.outflows},${item.netChange}`)
      }

      // Add receivables summary
      csvRows.push('')
      csvRows.push('Outstanding Receivables')
      csvRows.push('Customer,Amount Due,Due Date,Status')
      for (const invoice of exportData.receivables.outstanding) {
        csvRows.push(`"${invoice.contact}",${invoice.amountDue},${invoice.dueDate},Outstanding`)
      }

      if (exportData.receivables.overdue.length > 0) {
        csvRows.push('')
        csvRows.push('Overdue Receivables')
        csvRows.push('Customer,Amount Due,Due Date,Days Overdue')
        for (const invoice of exportData.receivables.overdue) {
          const daysOverdue = invoice.dueDate ? Math.floor((new Date().getTime() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24)) : 0
          csvRows.push(`"${invoice.contact}",${invoice.amountDue},${invoice.dueDate},${daysOverdue}`)
        }
      }

      setHeader(event, 'Content-Type', 'text/csv')
      setHeader(event, 'Content-Disposition', `attachment; filename="cashflow-export-${new Date().toISOString().slice(0, 10)}.csv"`)
      
      return csvRows.join('\n')
    }

    if (format === 'excel') {
      // For Excel format, we'll return structured JSON that can be processed by the client
      // The client can use libraries like xlsx to generate the actual Excel file
      const excelData = {
        sheets: [
          {
            name: 'Cash Flow Forecast',
            data: [
              ['Date', 'Balance', 'Inflows', 'Outflows', 'Net Change'],
              ...exportData.dailyForecast.map((item: any) => [
                item.date,
                item.balance,
                item.inflows,
                item.outflows,
                item.netChange
              ])
            ]
          },
          {
            name: 'Outstanding Receivables',
            data: [
              ['Customer', 'Invoice Number', 'Amount Due', 'Due Date', 'Status'],
              ...exportData.receivables.outstanding.map((invoice: any) => [
                invoice.contact,
                invoice.number,
                invoice.amountDue,
                invoice.dueDate,
                'Outstanding'
              ])
            ]
          }
        ]
      }

      if (exportData.receivables.overdue.length > 0) {
        excelData.sheets.push({
          name: 'Overdue Receivables',
          data: [
            ['Customer', 'Invoice Number', 'Amount Due', 'Due Date', 'Days Overdue'],
            ...exportData.receivables.overdue.map((invoice: any) => {
              const daysOverdue = invoice.dueDate ? Math.floor((new Date().getTime() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24)) : 0
              return [
                invoice.contact,
                invoice.number,
                invoice.amountDue,
                invoice.dueDate,
                daysOverdue
              ]
            })
          ]
        })
      }

      if (scenarios) {
        excelData.sheets.push({
          name: 'Scenario Analysis',
          data: [
            ['Date', 'Best Case', 'Most Likely', 'Worst Case'],
            ...scenarios.scenarios.combined.map((item: any) => [
              item.date,
              item.bestCase,
              item.likelyCase,
              item.worstCase
            ])
          ]
        })
      }

      setHeader(event, 'Content-Type', 'application/json')
      return { type: 'excel', data: excelData, filename: `cashflow-export-${new Date().toISOString().slice(0, 10)}.xlsx` }
    }

    // Default JSON format
    setHeader(event, 'Content-Type', 'application/json')
    if (query.download === 'true') {
      setHeader(event, 'Content-Disposition', `attachment; filename="cashflow-export-${new Date().toISOString().slice(0, 10)}.json"`)
    }
    
    return exportData

  } catch (error: any) {
    console.error('Export error:', error)
    throw createError({ 
      statusCode: error.statusCode || 500, 
      statusMessage: error.statusMessage || 'Failed to export cash flow data' 
    })
  }
})
