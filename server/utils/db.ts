/**
 * Database Utility
 * Provides connection pooling and query helpers for Postgres
 */

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg'

// Connection pool (singleton)
let pool: Pool | null = null

/**
 * Get or create the database connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || useRuntimeConfig().databaseUrl

    if (!connectionString) {
      throw new Error('DATABASE_URL is not configured')
    }

    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
      max: 10, // Maximum connections in pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })

    // Log connection errors
    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err)
    })
  }

  return pool
}

/**
 * Execute a query with parameters
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const pool = getPool()
  const start = Date.now()

  try {
    const result = await pool.query<T>(text, params)
    const duration = Date.now() - start

    // Log slow queries in development
    if (process.dev && duration > 100) {
      console.warn(`Slow query (${duration}ms):`, text.slice(0, 100))
    }

    return result
  } catch (error) {
    console.error('Database query error:', error)
    throw error
  }
}

/**
 * Execute a query and return all rows
 */
export async function queryRows<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const result = await query<T>(text, params)
  return result.rows
}

/**
 * Execute a query and return single row (or null)
 */
export async function queryOne<T = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const result = await query<T>(text, params)
  return result.rows[0] || null
}

/**
 * Execute a query and return the count of affected rows
 */
export async function queryCount(
  text: string,
  params?: any[]
): Promise<number> {
  const result = await query(text, params)
  return result.rowCount || 0
}

/**
 * Execute a query without returning rows (for INSERT/UPDATE/DELETE)
 */
export async function execute(
  text: string,
  params?: any[]
): Promise<void> {
  await query(text, params)
}

/**
 * Execute multiple queries in a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Health check - verify database connection
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await query('SELECT 1 as ok')
    return result.rows[0]?.ok === 1
  } catch {
    return false
  }
}

// ============================================
// Type-safe query builders for agency entities
// ============================================

export const db = {
  // Chart of Accounts
  chartOfAccounts: {
    async findAll(category?: string) {
      const sql = category
        ? 'SELECT * FROM chart_of_accounts WHERE is_active = true AND category = $1 ORDER BY code'
        : 'SELECT * FROM chart_of_accounts WHERE is_active = true ORDER BY code'
      return queryRows(sql, category ? [category] : undefined)
    },

    async findByCode(code: string) {
      return queryOne('SELECT * FROM chart_of_accounts WHERE code = $1', [code])
    },
  },

  // Agency Clients
  clients: {
    async findAll(activeOnly = true) {
      const sql = activeOnly
        ? 'SELECT * FROM agency_clients WHERE is_active = true ORDER BY name'
        : 'SELECT * FROM agency_clients ORDER BY name'
      return queryRows(sql)
    },

    async findById(id: string) {
      return queryOne('SELECT * FROM agency_clients WHERE id = $1', [id])
    },

    async create(data: {
      name: string
      billing_type: string
      payment_terms?: number
      retainer_amount?: number
      hourly_rate?: number
      media_commission_rate?: number
      xero_contact_id?: string
      notes?: string
    }) {
      const sql = `
        INSERT INTO agency_clients (name, billing_type, payment_terms, retainer_amount, hourly_rate, media_commission_rate, xero_contact_id, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `
      return queryOne(sql, [
        data.name,
        data.billing_type,
        data.payment_terms || 30,
        data.retainer_amount,
        data.hourly_rate,
        data.media_commission_rate,
        data.xero_contact_id,
        data.notes,
      ])
    },

    async update(id: string, data: Partial<{
      name: string
      billing_type: string
      payment_terms: number
      retainer_amount: number
      hourly_rate: number
      media_commission_rate: number
      xero_contact_id: string
      notes: string
      is_active: boolean
    }>) {
      const fields: string[] = []
      const values: any[] = []
      let idx = 1

      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          fields.push(`${key} = $${idx}`)
          values.push(value)
          idx++
        }
      }

      if (fields.length === 0) return null

      values.push(id)
      const sql = `UPDATE agency_clients SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`
      return queryOne(sql, values)
    },
  },

  // Projects
  projects: {
    async findAll(filters?: { status?: string; clientId?: string }) {
      let sql = `
        SELECT p.*, c.name as client_name
        FROM projects p
        JOIN agency_clients c ON p.client_id = c.id
        WHERE 1=1
      `
      const params: any[] = []
      let idx = 1

      if (filters?.status) {
        sql += ` AND p.status = $${idx}`
        params.push(filters.status)
        idx++
      }

      if (filters?.clientId) {
        sql += ` AND p.client_id = $${idx}`
        params.push(filters.clientId)
        idx++
      }

      sql += ' ORDER BY p.start_date DESC'
      return queryRows(sql, params)
    },

    async findById(id: string) {
      return queryOne(`
        SELECT p.*, c.name as client_name
        FROM projects p
        JOIN agency_clients c ON p.client_id = c.id
        WHERE p.id = $1
      `, [id])
    },

    async findWithProfitability(filters?: { status?: string; clientId?: string }) {
      let sql = `
        SELECT * FROM v_project_profitability
        WHERE 1=1
      `
      const params: any[] = []
      let idx = 1

      if (filters?.status) {
        sql += ` AND status = $${idx}`
        params.push(filters.status)
        idx++
      }

      sql += ' ORDER BY gross_margin DESC'
      return queryRows(sql, params)
    },

    async create(data: {
      client_id: string
      name: string
      budget_amount: number
      budget_type: string
      start_date: string
      end_date?: string
      description?: string
      project_manager_id?: string
    }) {
      const sql = `
        INSERT INTO projects (client_id, name, budget_amount, budget_type, start_date, end_date, description, project_manager_id, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
        RETURNING *
      `
      return queryOne(sql, [
        data.client_id,
        data.name,
        data.budget_amount,
        data.budget_type,
        data.start_date,
        data.end_date,
        data.description,
        data.project_manager_id,
      ])
    },
  },

  // Time Entries
  timeEntries: {
    async findByProject(projectId: string) {
      return queryRows(`
        SELECT te.*, tm.name as user_name
        FROM time_entries te
        JOIN team_members tm ON te.user_id = tm.id
        WHERE te.project_id = $1
        ORDER BY te.date DESC
      `, [projectId])
    },

    async findRecent(limit = 10) {
      return queryRows(`
        SELECT te.*, tm.name as user_name, p.name as project_name
        FROM time_entries te
        JOIN team_members tm ON te.user_id = tm.id
        JOIN projects p ON te.project_id = p.id
        ORDER BY te.date DESC, te.created_at DESC
        LIMIT $1
      `, [limit])
    },

    async create(data: {
      project_id: string
      user_id: string
      date: string
      hours: number
      hourly_rate: number
      description?: string
      billable?: boolean
    }) {
      const sql = `
        INSERT INTO time_entries (project_id, user_id, date, hours, hourly_rate, description, billable)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `
      return queryOne(sql, [
        data.project_id,
        data.user_id,
        data.date,
        data.hours,
        data.hourly_rate,
        data.description || '',
        data.billable ?? true,
      ])
    },
  },

  // Team Members
  teamMembers: {
    async findAll(activeOnly = true) {
      const sql = activeOnly
        ? 'SELECT * FROM team_members WHERE is_active = true ORDER BY name'
        : 'SELECT * FROM team_members ORDER BY name'
      return queryRows(sql)
    },

    async findById(id: string) {
      return queryOne('SELECT * FROM team_members WHERE id = $1', [id])
    },
  },

  // Utilization
  utilization: {
    async getByPeriod(period: string) {
      return queryRows(`
        SELECT * FROM v_utilization
        WHERE period = $1
        ORDER BY utilization_rate DESC
      `, [period])
    },

    async getCurrent() {
      const currentPeriod = new Date().toISOString().slice(0, 7) // YYYY-MM
      return this.getByPeriod(currentPeriod)
    },
  },

  // Media Spend
  mediaSpend: {
    async findByClient(clientId: string, period?: string) {
      let sql = 'SELECT * FROM media_spend WHERE client_id = $1'
      const params: any[] = [clientId]

      if (period) {
        sql += ' AND period = $2'
        params.push(period)
      }

      sql += ' ORDER BY period DESC, platform'
      return queryRows(sql, params)
    },

    async create(data: {
      client_id: string
      platform: string
      budget_allocated: number
      actual_spend?: number
      commission_rate?: number
      period: string
      project_id?: string
      notes?: string
    }) {
      const sql = `
        INSERT INTO media_spend (client_id, platform, budget_allocated, actual_spend, commission_rate, period, project_id, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `
      return queryOne(sql, [
        data.client_id,
        data.platform,
        data.budget_allocated,
        data.actual_spend || 0,
        data.commission_rate || 0,
        data.period,
        data.project_id,
        data.notes,
      ])
    },
  },
}
