// Export utilities for downloading data as CSV, Excel, etc.

interface ExportOptions {
  filename?: string
  delimiter?: string
  includeHeaders?: boolean
  dateFormat?: string
}

/**
 * Convert array of objects to CSV string
 */
export function arrayToCSV(data: any[], options: ExportOptions = {}): string {
  const {
    delimiter = ',',
    includeHeaders = true,
    dateFormat = 'YYYY-MM-DD'
  } = options

  if (!data.length) return ''

  // Get headers from first object
  const headers = Object.keys(data[0])
  
  // Format value for CSV
  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return ''
    
    // Handle dates
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10)
    }
    
    // Handle numbers
    if (typeof value === 'number') {
      return value.toString()
    }
    
    // Handle strings - escape quotes and wrap in quotes if contains delimiter
    const stringValue = String(value)
    if (stringValue.includes(delimiter) || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`
    }
    
    return stringValue
  }

  // Build CSV content
  const csvContent = []
  
  // Add headers if requested
  if (includeHeaders) {
    csvContent.push(headers.map(header => formatValue(header)).join(delimiter))
  }
  
  // Add data rows
  data.forEach(row => {
    const values = headers.map(header => formatValue(row[header]))
    csvContent.push(values.join(delimiter))
  })
  
  return csvContent.join('\n')
}

/**
 * Download data as CSV file
 */
export function downloadCSV(data: any[], filename: string, options: ExportOptions = {}): void {
  const csv = arrayToCSV(data, options)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  
  // Create download link
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  
  link.setAttribute('href', url)
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`)
  link.style.visibility = 'hidden'
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  // Clean up
  URL.revokeObjectURL(url)
}

/**
 * Download data as JSON file
 */
export function downloadJSON(data: any, filename: string): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
  
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  
  link.setAttribute('href', url)
  link.setAttribute('download', filename.endsWith('.json') ? filename : `${filename}.json`)
  link.style.visibility = 'hidden'
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  URL.revokeObjectURL(url)
}

/**
 * Format data for export with common transformations
 */
export function formatForExport(data: any[], type: 'expenses' | 'invoices' | 'kpis' | 'cashflow' = 'expenses'): any[] {
  if (!data.length) return []

  switch (type) {
    case 'expenses':
      return data.map(item => ({
        Date: item.date || '',
        Vendor: item.vendor || item.contact || '',
        Category: item.category || item.name || '',
        Amount: item.amount || 0,
        Description: item.description || item.reference || '',
        Status: item.status || ''
      }))
      
    case 'invoices':
      return data.map(item => ({
        'Invoice Number': item.number || item.invoiceNumber || '',
        Date: item.date || '',
        'Due Date': item.dueDate || '',
        Customer: item.contact || item.customer || '',
        Amount: item.amount || item.total || 0,
        'Amount Due': item.amountDue || 0,
        Status: item.status || '',
        Reference: item.reference || ''
      }))
      
    case 'kpis':
      return data.map(item => ({
        Metric: item.name || item.label || '',
        Value: item.value || item.amount || 0,
        'Previous Period': item.previousValue || 0,
        'Change %': item.changePercent || 0,
        Trend: item.trend || '',
        Date: item.date || new Date().toISOString().slice(0, 10)
      }))
      
    case 'cashflow':
      return data.map(item => ({
        Date: item.date || '',
        Balance: item.balance || 0,
        Inflows: item.inflows || 0,
        Outflows: item.outflows || 0,
        'Net Change': item.netChange || 0
      }))
      
    default:
      return data
  }
}

/**
 * Get appropriate filename with timestamp
 */
export function getExportFilename(type: string, format: 'csv' | 'json' = 'csv'): string {
  const timestamp = new Date().toISOString().slice(0, 10)
  return `${type}-export-${timestamp}.${format}`
}

/**
 * Export expenses data
 */
export async function exportExpenses(apiEndpoint: string = '/api/xero/expenses'): Promise<void> {
  try {
    const { data } = await $fetch(apiEndpoint)
    
    if (!data?.categories?.length && !data?.vendors?.length) {
      throw new Error('No expense data to export')
    }
    
    // Combine categories and vendors into a unified export
    const exportData = [
      ...data.categories.map((item: any) => ({
        type: 'Category',
        name: item.name,
        amount: item.amount,
        date: data.range?.to || new Date().toISOString().slice(0, 10)
      })),
      ...data.vendors.map((item: any) => ({
        type: 'Vendor',
        name: item.name,
        amount: item.amount,
        date: data.range?.to || new Date().toISOString().slice(0, 10)
      }))
    ]
    
    const formatted = formatForExport(exportData, 'expenses')
    downloadCSV(formatted, getExportFilename('expenses'))
    
  } catch (error) {
    console.error('Export failed:', error)
    throw error
  }
}

/**
 * Export KPI data
 */
export async function exportKPIs(apiEndpoint: string = '/api/kpis-advanced'): Promise<void> {
  try {
    const data = await $fetch(apiEndpoint)
    
    const kpiData = [
      { name: 'Revenue', value: data.revenue?.current || 0, trend: data.revenue?.trend || '' },
      { name: 'Expenses', value: data.expenses?.current || 0, trend: data.expenses?.trend || '' },
      { name: 'Profit', value: data.profit?.current || 0, trend: data.profit?.trend || '' },
      { name: 'Cash Position', value: data.cash?.current || 0, trend: 'stable' },
      { name: 'Health Score', value: data.ratios?.healthScore || 0, trend: 'stable' }
    ]
    
    const formatted = formatForExport(kpiData, 'kpis')
    downloadCSV(formatted, getExportFilename('kpis'))
    
  } catch (error) {
    console.error('KPI export failed:', error)
    throw error
  }
}

/**
 * Export cash flow forecast
 */
export async function exportCashFlow(apiEndpoint: string = '/api/xero/reports/cash-flow-forecast'): Promise<void> {
  try {
    const data = await $fetch(apiEndpoint)
    
    if (!data?.forecast?.length) {
      throw new Error('No cash flow data to export')
    }
    
    const formatted = formatForExport(data.forecast, 'cashflow')
    downloadCSV(formatted, getExportFilename('cashflow'))
    
  } catch (error) {
    console.error('Cash flow export failed:', error)
    throw error
  }
}
