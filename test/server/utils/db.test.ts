/**
 * Database Utility Tests
 *
 * Tests for the database utility functions.
 * Note: These tests focus on the logic of the helper functions,
 * not the actual database connection which requires proper Pool mocking.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'

// Mock the pg module before importing db utilities
// The mock needs to be defined inline in vi.mock for hoisting to work
vi.mock('pg', () => {
  const mockQuery = vi.fn()
  const mockClientQuery = vi.fn()
  const mockClientRelease = vi.fn()
  const mockConnect = vi.fn()

  // Create a mock Pool class
  class MockPool {
    static mockQuery = mockQuery
    static mockClientQuery = mockClientQuery
    static mockClientRelease = mockClientRelease
    static mockConnect = mockConnect

    query = mockQuery
    connect = mockConnect
    on = vi.fn()

    constructor() {
      mockConnect.mockResolvedValue({
        query: mockClientQuery,
        release: mockClientRelease
      })
    }
  }

  return { Pool: MockPool }
})

// Mock Nuxt runtime config
vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    databaseUrl: 'postgresql://test:test@localhost:5432/test_db'
  })
}))

// Set environment variables before imports
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db'

// Import module under test after mocks
import { query, queryRows, queryOne, queryCount, execute, transaction, healthCheck, db } from '../../../server/utils/db'
import { Pool } from 'pg'

// Get mock references from the Pool class
const getMocks = () => {
  const PoolClass = Pool as any
  return {
    mockQuery: PoolClass.mockQuery,
    mockClientQuery: PoolClass.mockClientQuery,
    mockClientRelease: PoolClass.mockClientRelease,
    mockConnect: PoolClass.mockConnect
  }
}

describe('database utility', () => {
  let mocks: ReturnType<typeof getMocks>

  beforeAll(() => {
    mocks = getMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock implementations
    mocks.mockConnect.mockResolvedValue({
      query: mocks.mockClientQuery,
      release: mocks.mockClientRelease
    })
  })

  describe('query', () => {
    it('should execute query and return result', async () => {
      const mockResult = {
        rows: [{ id: 1, name: 'Test' }],
        rowCount: 1
      }
      mocks.mockQuery.mockResolvedValue(mockResult)

      const result = await query('SELECT * FROM users WHERE id = $1', [1])

      expect(mocks.mockQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1])
      expect(result).toEqual(mockResult)
    })

    it('should execute query without parameters', async () => {
      const mockResult = { rows: [], rowCount: 0 }
      mocks.mockQuery.mockResolvedValue(mockResult)

      await query('SELECT 1')

      expect(mocks.mockQuery).toHaveBeenCalledWith('SELECT 1', undefined)
    })

    it('should throw on query error', async () => {
      const dbError = new Error('Connection refused')
      mocks.mockQuery.mockRejectedValue(dbError)

      await expect(query('SELECT * FROM nonexistent')).rejects.toThrow('Connection refused')
    })

    it('should handle multiple parameters', async () => {
      const mockResult = { rows: [], rowCount: 0 }
      mocks.mockQuery.mockResolvedValue(mockResult)

      await query(
        'INSERT INTO users (name, email, role) VALUES ($1, $2, $3)',
        ['John', 'john@example.com', 'admin']
      )

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        'INSERT INTO users (name, email, role) VALUES ($1, $2, $3)',
        ['John', 'john@example.com', 'admin']
      )
    })
  })

  describe('queryRows', () => {
    it('should return rows array', async () => {
      const mockRows = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
      ]
      mocks.mockQuery.mockResolvedValue({ rows: mockRows, rowCount: 2 })

      const result = await queryRows('SELECT * FROM users')

      expect(result).toEqual(mockRows)
    })

    it('should return empty array when no rows', async () => {
      mocks.mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      const result = await queryRows('SELECT * FROM users WHERE id = $1', [999])

      expect(result).toEqual([])
    })

    it('should preserve row order', async () => {
      const mockRows = [
        { id: 3, score: 100 },
        { id: 1, score: 80 },
        { id: 2, score: 90 }
      ]
      mocks.mockQuery.mockResolvedValue({ rows: mockRows, rowCount: 3 })

      const result = await queryRows('SELECT * FROM scores ORDER BY score DESC')

      expect(result[0].id).toBe(3)
      expect(result[1].id).toBe(1)
      expect(result[2].id).toBe(2)
    })
  })

  describe('queryOne', () => {
    it('should return first row', async () => {
      const mockRow = { id: 1, name: 'Single User' }
      mocks.mockQuery.mockResolvedValue({ rows: [mockRow], rowCount: 1 })

      const result = await queryOne('SELECT * FROM users WHERE id = $1', [1])

      expect(result).toEqual(mockRow)
    })

    it('should return null when no rows', async () => {
      mocks.mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      const result = await queryOne('SELECT * FROM users WHERE id = $1', [999])

      expect(result).toBeNull()
    })

    it('should return only first row when multiple rows returned', async () => {
      const mockRows = [
        { id: 1, name: 'First' },
        { id: 2, name: 'Second' }
      ]
      mocks.mockQuery.mockResolvedValue({ rows: mockRows, rowCount: 2 })

      const result = await queryOne('SELECT * FROM users LIMIT 2')

      expect(result).toEqual({ id: 1, name: 'First' })
    })
  })

  describe('queryCount', () => {
    it('should return row count', async () => {
      mocks.mockQuery.mockResolvedValue({ rows: [], rowCount: 5 })

      const count = await queryCount('UPDATE users SET active = true WHERE role = $1', ['admin'])

      expect(count).toBe(5)
    })

    it('should return 0 when rowCount is null', async () => {
      mocks.mockQuery.mockResolvedValue({ rows: [], rowCount: null })

      const count = await queryCount('DELETE FROM users WHERE id = $1', [999])

      expect(count).toBe(0)
    })
  })

  describe('execute', () => {
    it('should execute query without returning rows', async () => {
      mocks.mockQuery.mockResolvedValue({ rows: [], rowCount: 1 })

      await expect(execute('DELETE FROM users WHERE id = $1', [1])).resolves.toBeUndefined()
      expect(mocks.mockQuery).toHaveBeenCalled()
    })

    it('should propagate errors', async () => {
      mocks.mockQuery.mockRejectedValue(new Error('Constraint violation'))

      await expect(execute('INSERT INTO users (email) VALUES ($1)', ['duplicate@example.com']))
        .rejects.toThrow('Constraint violation')
    })
  })

  describe('transaction', () => {
    it('should execute callback in transaction context', async () => {
      mocks.mockClientQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 })

      const result = await transaction(async (client) => {
        const res = await client.query('INSERT INTO users (name) VALUES ($1) RETURNING id', ['Test'])
        return res.rows[0]
      })

      expect(mocks.mockClientQuery).toHaveBeenCalledWith('BEGIN')
      expect(mocks.mockClientQuery).toHaveBeenCalledWith('COMMIT')
      expect(mocks.mockClientRelease).toHaveBeenCalled()
      expect(result).toEqual({ id: 1 })
    })

    it('should rollback on callback error', async () => {
      mocks.mockClientQuery.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') {
          return Promise.resolve({ rows: [], rowCount: 0 })
        }
        return Promise.reject(new Error('Query failed'))
      })

      await expect(transaction(async (client) => {
        await client.query('INSERT INTO users (name) VALUES ($1)', ['Test'])
      })).rejects.toThrow('Query failed')

      expect(mocks.mockClientQuery).toHaveBeenCalledWith('BEGIN')
      expect(mocks.mockClientQuery).toHaveBeenCalledWith('ROLLBACK')
      expect(mocks.mockClientRelease).toHaveBeenCalled()
    })

    it('should release client even on error', async () => {
      mocks.mockClientQuery.mockImplementation((sql: string) => {
        if (sql === 'BEGIN') return Promise.resolve({ rows: [], rowCount: 0 })
        if (sql === 'ROLLBACK') return Promise.resolve({ rows: [], rowCount: 0 })
        throw new Error('Query error')
      })

      await expect(transaction(async (client) => {
        await client.query('FAILING QUERY')
      })).rejects.toThrow()

      expect(mocks.mockClientRelease).toHaveBeenCalled()
    })
  })

  describe('healthCheck', () => {
    it('should return true on successful connection', async () => {
      mocks.mockQuery.mockResolvedValue({ rows: [{ ok: 1 }], rowCount: 1 })

      const result = await healthCheck()

      expect(result).toBe(true)
      expect(mocks.mockQuery).toHaveBeenCalledWith('SELECT 1 as ok', undefined)
    })

    it('should return false on connection failure', async () => {
      mocks.mockQuery.mockRejectedValue(new Error('Connection refused'))

      const result = await healthCheck()

      expect(result).toBe(false)
    })

    it('should return false on unexpected result', async () => {
      mocks.mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      const result = await healthCheck()

      expect(result).toBe(false)
    })
  })

  describe('SQL injection protection', () => {
    it('should use parameterized queries', async () => {
      mocks.mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      // This malicious input should be safely parameterized
      const maliciousInput = "'; DROP TABLE users; --"
      await query('SELECT * FROM users WHERE name = $1', [maliciousInput])

      // The query should pass the malicious string as a parameter, not interpolated
      expect(mocks.mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE name = $1',
        [maliciousInput]
      )
    })
  })
})

// Test entity query builders
describe('db entity builders', () => {
  let mocks: ReturnType<typeof getMocks>

  beforeAll(() => {
    mocks = getMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('db.clients', () => {
    it('should findAll active clients by default', async () => {
      const mockClients = [
        { id: '1', name: 'Client A', is_active: true },
        { id: '2', name: 'Client B', is_active: true }
      ]
      mocks.mockQuery.mockResolvedValue({ rows: mockClients, rowCount: 2 })

      const result = await db.clients.findAll()

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_active = true'),
        undefined
      )
      expect(result).toEqual(mockClients)
    })

    it('should findAll including inactive when specified', async () => {
      mocks.mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      await db.clients.findAll(false)

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.not.stringContaining('is_active'),
        undefined
      )
    })

    it('should findById', async () => {
      const mockClient = { id: 'client-1', name: 'Test Client' }
      mocks.mockQuery.mockResolvedValue({ rows: [mockClient], rowCount: 1 })

      const result = await db.clients.findById('client-1')

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1'),
        ['client-1']
      )
      expect(result).toEqual(mockClient)
    })

    it('should create client', async () => {
      const newClient = { id: 'new-1', name: 'New Client' }
      mocks.mockQuery.mockResolvedValue({ rows: [newClient], rowCount: 1 })

      const result = await db.clients.create({
        name: 'New Client',
        billing_type: 'hourly',
        payment_terms: 30
      })

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agency_clients'),
        expect.arrayContaining(['New Client', 'hourly', 30])
      )
      expect(result).toEqual(newClient)
    })

    it('should update client', async () => {
      const updatedClient = { id: 'client-1', name: 'Updated Name' }
      mocks.mockQuery.mockResolvedValue({ rows: [updatedClient], rowCount: 1 })

      const result = await db.clients.update('client-1', { name: 'Updated Name' })

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE agency_clients'),
        expect.arrayContaining(['Updated Name', 'client-1'])
      )
      expect(result).toEqual(updatedClient)
    })

    it('should return null when updating with no fields', async () => {
      const result = await db.clients.update('client-1', {})

      expect(mocks.mockQuery).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })
  })

  describe('db.projects', () => {
    it('should findAll projects', async () => {
      const mockProjects = [{ id: 'p1', name: 'Project 1' }]
      mocks.mockQuery.mockResolvedValue({ rows: mockProjects, rowCount: 1 })

      const result = await db.projects.findAll()

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT p.*, c.name as client_name'),
        []
      )
      expect(result).toEqual(mockProjects)
    })

    it('should findAll with status filter', async () => {
      mocks.mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      await db.projects.findAll({ status: 'active' })

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('p.status = $1'),
        ['active']
      )
    })

    it('should findAll with clientId filter', async () => {
      mocks.mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      await db.projects.findAll({ clientId: 'c1' })

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('p.client_id = $1'),
        ['c1']
      )
    })

    it('should findById', async () => {
      const mockProject = { id: 'p1', name: 'Project', client_name: 'Client' }
      mocks.mockQuery.mockResolvedValue({ rows: [mockProject], rowCount: 1 })

      const result = await db.projects.findById('p1')

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE p.id = $1'),
        ['p1']
      )
      expect(result).toEqual(mockProject)
    })

    it('should findWithProfitability', async () => {
      const mockData = [{ id: 'p1', gross_margin: 5000 }]
      mocks.mockQuery.mockResolvedValue({ rows: mockData, rowCount: 1 })

      const result = await db.projects.findWithProfitability()

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('v_project_profitability'),
        []
      )
      expect(result).toEqual(mockData)
    })

    it('should findWithProfitability with status filter', async () => {
      mocks.mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      await db.projects.findWithProfitability({ status: 'completed' })

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('status = $1'),
        ['completed']
      )
    })

    it('should create project', async () => {
      const newProject = { id: 'p-new', name: 'New Project', status: 'draft' }
      mocks.mockQuery.mockResolvedValue({ rows: [newProject], rowCount: 1 })

      const result = await db.projects.create({
        client_id: 'c1',
        name: 'New Project',
        budget_amount: 10000,
        budget_type: 'fixed',
        start_date: '2024-01-01'
      })

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO projects'),
        expect.arrayContaining(['c1', 'New Project', 10000, 'fixed', '2024-01-01'])
      )
      expect(result).toEqual(newProject)
    })
  })

  describe('db.timeEntries', () => {
    it('should findByProject', async () => {
      const mockEntries = [{ id: 't1', hours: 2, user_name: 'John' }]
      mocks.mockQuery.mockResolvedValue({ rows: mockEntries, rowCount: 1 })

      const result = await db.timeEntries.findByProject('p1')

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE te.project_id = $1'),
        ['p1']
      )
      expect(result).toEqual(mockEntries)
    })

    it('should findRecent with default limit', async () => {
      const mockEntries = [{ id: 't1' }]
      mocks.mockQuery.mockResolvedValue({ rows: mockEntries, rowCount: 1 })

      const result = await db.timeEntries.findRecent()

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1'),
        [10]
      )
      expect(result).toEqual(mockEntries)
    })

    it('should findRecent with custom limit', async () => {
      mocks.mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      await db.timeEntries.findRecent(5)

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1'),
        [5]
      )
    })

    it('should create time entry', async () => {
      const newEntry = { id: 't-new', hours: 4 }
      mocks.mockQuery.mockResolvedValue({ rows: [newEntry], rowCount: 1 })

      const result = await db.timeEntries.create({
        project_id: 'p1',
        user_id: 'u1',
        date: '2024-01-15',
        hours: 4,
        hourly_rate: 150,
        description: 'Development work',
        billable: true
      })

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO time_entries'),
        expect.arrayContaining(['p1', 'u1', '2024-01-15', 4, 150, 'Development work', true])
      )
      expect(result).toEqual(newEntry)
    })
  })

  describe('db.teamMembers', () => {
    it('should findAll active members by default', async () => {
      const mockMembers = [{ id: 'u1', name: 'User 1' }]
      mocks.mockQuery.mockResolvedValue({ rows: mockMembers, rowCount: 1 })

      const result = await db.teamMembers.findAll()

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_active = true'),
        undefined
      )
      expect(result).toEqual(mockMembers)
    })

    it('should findAll including inactive', async () => {
      mocks.mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      await db.teamMembers.findAll(false)

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.not.stringContaining('is_active'),
        undefined
      )
    })

    it('should findById', async () => {
      const mockMember = { id: 'u1', name: 'User' }
      mocks.mockQuery.mockResolvedValue({ rows: [mockMember], rowCount: 1 })

      const result = await db.teamMembers.findById('u1')

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1'),
        ['u1']
      )
      expect(result).toEqual(mockMember)
    })
  })

  describe('db.utilization', () => {
    it('should getByPeriod', async () => {
      const mockData = [{ user_id: 'u1', utilization_rate: 85 }]
      mocks.mockQuery.mockResolvedValue({ rows: mockData, rowCount: 1 })

      const result = await db.utilization.getByPeriod('2024-01')

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE period = $1'),
        ['2024-01']
      )
      expect(result).toEqual(mockData)
    })

    it('should getCurrent using current month', async () => {
      const mockData = [{ user_id: 'u1' }]
      mocks.mockQuery.mockResolvedValue({ rows: mockData, rowCount: 1 })

      const result = await db.utilization.getCurrent()

      const expectedPeriod = new Date().toISOString().slice(0, 7)
      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE period = $1'),
        [expectedPeriod]
      )
      expect(result).toEqual(mockData)
    })
  })

  describe('db.mediaSpend', () => {
    it('should findByClient', async () => {
      const mockSpend = [{ id: 's1', platform: 'Google', budget_allocated: 5000 }]
      mocks.mockQuery.mockResolvedValue({ rows: mockSpend, rowCount: 1 })

      const result = await db.mediaSpend.findByClient('c1')

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE client_id = $1'),
        ['c1']
      )
      expect(result).toEqual(mockSpend)
    })

    it('should findByClient with period filter', async () => {
      mocks.mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      await db.mediaSpend.findByClient('c1', '2024-01')

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND period = $2'),
        ['c1', '2024-01']
      )
    })

    it('should create media spend entry', async () => {
      const newSpend = { id: 's-new', platform: 'Facebook' }
      mocks.mockQuery.mockResolvedValue({ rows: [newSpend], rowCount: 1 })

      const result = await db.mediaSpend.create({
        client_id: 'c1',
        platform: 'Facebook',
        budget_allocated: 10000,
        actual_spend: 8000,
        commission_rate: 15,
        period: '2024-01',
        notes: 'Q1 campaign'
      })

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO media_spend'),
        expect.arrayContaining(['c1', 'Facebook', 10000, 8000, 15, '2024-01'])
      )
      expect(result).toEqual(newSpend)
    })
  })

  describe('db.chartOfAccounts', () => {
    it('should findAll', async () => {
      const mockAccounts = [{ code: '1000', name: 'Cash' }]
      mocks.mockQuery.mockResolvedValue({ rows: mockAccounts, rowCount: 1 })

      const result = await db.chartOfAccounts.findAll()

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_active = true'),
        undefined
      )
      expect(result).toEqual(mockAccounts)
    })

    it('should findAll with category filter', async () => {
      mocks.mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      await db.chartOfAccounts.findAll('assets')

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('category = $1'),
        ['assets']
      )
    })

    it('should findByCode', async () => {
      const mockAccount = { code: '1000', name: 'Cash' }
      mocks.mockQuery.mockResolvedValue({ rows: [mockAccount], rowCount: 1 })

      const result = await db.chartOfAccounts.findByCode('1000')

      expect(mocks.mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE code = $1'),
        ['1000']
      )
      expect(result).toEqual(mockAccount)
    })
  })
})
