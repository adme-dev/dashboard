import {
  fetchBankSummary,
  fetchPayables,
  fetchReceivables,
  fetchRecentPaidExpenses
} from './xeroDataFetcher'

/**
 * Fetch the four cold-cache inputs without consuming Xero's five-call
 * concurrent-request allowance by itself. Dashboard P&L and aging requests can
 * then run alongside either two-call batch without creating a six-call burst.
 */
export async function fetchCashFlowInputs(accessToken: string, tenantId: string) {
  const [bankReportBody, receivablesBody] = await Promise.all([
    fetchBankSummary(accessToken, tenantId),
    fetchReceivables(accessToken, tenantId)
  ])
  const [payablesBody, expensesBody] = await Promise.all([
    fetchPayables(accessToken, tenantId),
    fetchRecentPaidExpenses(accessToken, tenantId)
  ])

  return [bankReportBody, receivablesBody, payablesBody, expensesBody] as const
}
