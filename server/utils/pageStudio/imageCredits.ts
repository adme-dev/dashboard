import { z } from 'zod'
import type { PageStudioControlQueryClient } from './controlStore'

const ScopeSchema = z.object({
  tenantId: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
  clientId: z.string().uuid(),
  environment: z.enum(['staging', 'production'])
}).strict()
const Id = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
const Credits = z.number().int().min(1).max(1_000_000_000)
const Fingerprint = z.string().regex(/^[a-f0-9]{64}$/)
const GrantSchema = z.object({ entryId: z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/), credits: Credits, fingerprint: Fingerprint }).strict()
const ReservationSchema = z.object({ reservationId: Id, siteId: z.string().uuid(), actorId: z.string().min(1).max(128),
  actorRole: z.enum(['agency', 'client']), credits: Credits, fingerprint: Fingerprint }).strict()
export type CreditScope = z.infer<typeof ScopeSchema>
export type ImageCreditBalance = { balance: number, reserved: number, available: number, frozen: boolean }
type WalletRow = { balance: string, reserved: string, frozen: boolean }
type ReservationRow = { site_id: string, actor_id: string, actor_role: string, credits: string, fingerprint: string, state: 'reserved' | 'settled' | 'released' }
export class ImageCreditError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message: string) {
    super(message)
    this.name = 'ImageCreditError'
  }
}
const conflict = () => new ImageCreditError('IMAGE_CREDITS_CONFLICT', 409, 'Credit operation conflicts with its saved identity')
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new ImageCreditError('IMAGE_CREDITS_INVALID', 400, 'Invalid credit operation')
  return result.data
}
function key(input: CreditScope) {
  const scope = parse(ScopeSchema, input)
  return [scope.tenantId, scope.clientId, scope.environment]
}
function balance(row?: WalletRow): ImageCreditBalance {
  const value = { balance: Number(row?.balance ?? 0), reserved: Number(row?.reserved ?? 0), frozen: row?.frozen ?? false }
  if (!Number.isSafeInteger(value.balance) || !Number.isSafeInteger(value.reserved)) throw new Error('Invalid persisted credit balance')
  return { ...value, available: value.frozen ? 0 : Math.max(0, value.balance - value.reserved) }
}

/** Trusted accounting only. All mutations require a caller-owned, non-retrying
 * SQL transaction and current native authorization. Lock order: site (caller),
 * wallet (here), then reservation. No network/provider work inside transactions. */
async function lockWallet(db: PageStudioControlQueryClient, args: string[]) {
  await db.query(`INSERT INTO page_studio_image_wallets(tenant_id,client_id,environment) VALUES($1,$2,$3)
    ON CONFLICT(tenant_id,client_id,environment) DO NOTHING`, args)
  const row = (await db.query<WalletRow>(`SELECT balance,reserved,frozen FROM page_studio_image_wallets
    WHERE tenant_id=$1 AND client_id=$2 AND environment=$3 FOR UPDATE`, args)).rows[0]
  if (!row) throw new Error('Missing locked image wallet')
  return balance(row)
}
export async function readImageCredits(db: PageStudioControlQueryClient, scope: CreditScope): Promise<ImageCreditBalance> {
  const row = (await db.query<WalletRow>(`SELECT balance,reserved,frozen FROM page_studio_image_wallets
    WHERE tenant_id=$1 AND client_id=$2 AND environment=$3`, key(scope))).rows[0]
  return balance(row)
}

/** Only a verified payment/administrative grant may call this; never browser input. */
export async function grantImageCredits(db: PageStudioControlQueryClient, scope: CreditScope, input: z.infer<typeof GrantSchema>) {
  const args = key(scope)
  const grant = parse(GrantSchema, input)
  await lockWallet(db, args)
  const entryId = `grant:${grant.entryId}`
  const existing = (await db.query<{ credit_delta: string, fingerprint: string, kind: string }>(`SELECT credit_delta,fingerprint,kind
    FROM page_studio_image_credit_entries WHERE tenant_id=$1 AND client_id=$2 AND environment=$3 AND entry_id=$4`, [...args, entryId])).rows[0]
  if (existing) {
    if (existing.kind !== 'grant' || Number(existing.credit_delta) !== grant.credits || existing.fingerprint !== grant.fingerprint) throw conflict()
  } else {
    await db.query(`UPDATE page_studio_image_wallets SET balance=balance+$4,updated_at=clock_timestamp()
      WHERE tenant_id=$1 AND client_id=$2 AND environment=$3`, [...args, grant.credits])
    await db.query(`INSERT INTO page_studio_image_credit_entries(tenant_id,client_id,environment,entry_id,kind,credit_delta,reserved_delta,fingerprint)
      VALUES($1,$2,$3,$4,'grant',$5,0,$6)`, [...args, entryId, grant.credits, grant.fingerprint])
  }
  return readImageCredits(db, scope)
}

export async function reserveImageCredits(db: PageStudioControlQueryClient, scope: CreditScope, input: z.infer<typeof ReservationSchema>) {
  const args = key(scope)
  const request = parse(ReservationSchema, input)
  const wallet = await lockWallet(db, args)
  const existing = (await db.query<ReservationRow>(`SELECT site_id,actor_id,actor_role,credits,fingerprint,state FROM page_studio_image_credit_reservations
    WHERE tenant_id=$1 AND client_id=$2 AND environment=$3 AND reservation_id=$4`, [...args, request.reservationId])).rows[0]
  if (existing) {
    if (existing.site_id !== request.siteId || existing.actor_id !== request.actorId || existing.actor_role !== request.actorRole
      || Number(existing.credits) !== request.credits || existing.fingerprint !== request.fingerprint) throw conflict()
    return { admitted: false, state: existing.state }
  }
  if (wallet.frozen) throw new ImageCreditError('IMAGE_CREDITS_FROZEN', 403, 'Credit spending is temporarily restricted')
  if (wallet.available < request.credits) throw new ImageCreditError('IMAGE_CREDITS_INSUFFICIENT', 402, 'Add credits before generating this image')
  await db.query(`INSERT INTO page_studio_image_credit_reservations(tenant_id,client_id,environment,reservation_id,site_id,actor_id,actor_role,credits,fingerprint)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [...args, request.reservationId, request.siteId, request.actorId, request.actorRole, request.credits, request.fingerprint])
  await db.query(`UPDATE page_studio_image_wallets SET reserved=reserved+$4,updated_at=clock_timestamp()
    WHERE tenant_id=$1 AND client_id=$2 AND environment=$3`, [...args, request.credits])
  await db.query(`INSERT INTO page_studio_image_credit_entries(tenant_id,client_id,environment,entry_id,kind,credit_delta,reserved_delta,fingerprint,reservation_id)
    VALUES($1,$2,$3,$4,'reserve',0,$5,$6,$7)`, [...args, `reserve:${request.reservationId}`, request.credits, request.fingerprint, request.reservationId])
  return { admitted: true, state: 'reserved' as const }
}

/** Settle only with a durable validated asset; release only on confirmed failure.
 * Unknown provider outcomes stay reserved. Reconciliation owns that decision. */
export async function finishImageCredits(db: PageStudioControlQueryClient, scope: CreditScope, reservationId: string, outcome: 'settled' | 'released') {
  const args = key(scope)
  parse(Id, reservationId)
  parse(z.enum(['settled', 'released']), outcome)
  await lockWallet(db, args)
  const row = (await db.query<ReservationRow>(`SELECT site_id,actor_id,actor_role,credits,fingerprint,state FROM page_studio_image_credit_reservations
    WHERE tenant_id=$1 AND client_id=$2 AND environment=$3 AND reservation_id=$4`, [...args, reservationId])).rows[0]
  if (!row) throw new ImageCreditError('IMAGE_CREDITS_NOT_FOUND', 404, 'Credit reservation not found')
  if (row.state === outcome) return { state: row.state }
  if (row.state !== 'reserved') throw conflict()
  const credits = Number(row.credits)
  const debit = outcome === 'settled' ? -credits : 0
  const kind = outcome === 'settled' ? 'settle' : 'release'
  await db.query(`UPDATE page_studio_image_wallets SET balance=balance+$4,reserved=reserved-$5,updated_at=clock_timestamp()
    WHERE tenant_id=$1 AND client_id=$2 AND environment=$3`, [...args, debit, credits])
  await db.query(`UPDATE page_studio_image_credit_reservations SET state=$5,finished_at=clock_timestamp()
    WHERE tenant_id=$1 AND client_id=$2 AND environment=$3 AND reservation_id=$4`, [...args, reservationId, outcome])
  await db.query(`INSERT INTO page_studio_image_credit_entries(tenant_id,client_id,environment,entry_id,kind,credit_delta,reserved_delta,fingerprint,reservation_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [...args, `${kind}:${reservationId}`, kind, debit, -credits, row.fingerprint, reservationId])
  return { state: outcome }
}
