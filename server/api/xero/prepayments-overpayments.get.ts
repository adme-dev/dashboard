/**
 * GET /api/xero/prepayments-overpayments
 *
 * Unearned revenue — money clients have paid before the work is
 * invoiced. For an agency that takes deposits and retainers this is
 * materially different from recognised revenue; it sits as a liability
 * on the balance sheet until consumed.
 *
 * Combines two Xero resources:
 *   - /Prepayments   — payments received but not yet allocated
 *   - /Overpayments  — client paid more than an invoice's balance
 *
 * Xero docs:
 *   https://developer.xero.com/documentation/api/accounting/prepayments
 *   https://developer.xero.com/documentation/api/accounting/overpayments
 */

import { createError } from 'h3'
import { xeroFetch } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'
import { getSelectedTenant } from '../../utils/session'
import { cachedFetch } from '../../utils/kv'
import { dedupedXeroCall } from '../../utils/xeroRateLimit'

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const cacheKey = `xero:prepayments-overpayments:${tenantId}`

  return cachedFetch(event, cacheKey, 600, async () => {
    const accessToken = token.access_token!

    const [prepay, overpay] = await Promise.all([
      dedupedXeroCall(
        `prepayments:${tenantId}`,
        'prepayments',
        () => xeroFetch<any>({
          accessToken,
          tenantId,
          // Only RECEIVE types (money in) and authorised/paid — we want liability on us.
          path: 'Prepayments?where=' + encodeURIComponent('Type=="RECEIVE-PREPAYMENT"') + '&page=1',
        })
      ),
      dedupedXeroCall(
        `overpayments:${tenantId}`,
        'overpayments',
        () => xeroFetch<any>({
          accessToken,
          tenantId,
          path: 'Overpayments?where=' + encodeURIComponent('Type=="RECEIVE-OVERPAYMENT"') + '&page=1',
        })
      ),
    ])

    const prepayments = (prepay?.prepayments ?? []) as any[]
    const overpayments = (overpay?.overpayments ?? []) as any[]

    let prepayRemaining = 0
    let overpayRemaining = 0
    const byContact = new Map<string, { name: string; prepay: number; overpay: number; count: number }>()

    for (const p of prepayments) {
      const remaining = Number(p.remainingCredit ?? p.total) || 0
      if (remaining <= 0) continue
      prepayRemaining += remaining
      const contact = p.contact?.name ?? 'Unknown'
      const entry = byContact.get(contact) ?? { name: contact, prepay: 0, overpay: 0, count: 0 }
      entry.prepay += remaining
      entry.count += 1
      byContact.set(contact, entry)
    }

    for (const o of overpayments) {
      const remaining = Number(o.remainingCredit ?? o.total) || 0
      if (remaining <= 0) continue
      overpayRemaining += remaining
      const contact = o.contact?.name ?? 'Unknown'
      const entry = byContact.get(contact) ?? { name: contact, prepay: 0, overpay: 0, count: 0 }
      entry.overpay += remaining
      entry.count += 1
      byContact.set(contact, entry)
    }

    const totalUnearned = prepayRemaining + overpayRemaining
    const topContacts = Array.from(byContact.values())
      .map(c => ({
        ...c,
        prepay: Math.round(c.prepay * 100) / 100,
        overpay: Math.round(c.overpay * 100) / 100,
        total: Math.round((c.prepay + c.overpay) * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    return {
      summary: {
        totalUnearned: Math.round(totalUnearned * 100) / 100,
        prepayRemaining: Math.round(prepayRemaining * 100) / 100,
        overpayRemaining: Math.round(overpayRemaining * 100) / 100,
        prepayCount: prepayments.filter(p => (Number(p.remainingCredit ?? p.total) || 0) > 0).length,
        overpayCount: overpayments.filter(o => (Number(o.remainingCredit ?? o.total) || 0) > 0).length,
        contactCount: byContact.size,
      },
      topContacts,
    }
  })
})
