/**
 * Zero Schema Definition
 * Defines the client-side schema for Zero sync engine
 * Maps to the Postgres schema in server/database/schema.sql
 */

import {
  createSchema,
  definePermissions,
  type ExpressionBuilder,
  type TableSchema,
  NOBODY_CAN,
  ANYONE_CAN,
} from '@rocicorp/zero'

// ============================================
// Table Definitions
// ============================================

const chartOfAccountsSchema = {
  tableName: 'chart_of_accounts',
  columns: {
    id: { type: 'string' },
    code: { type: 'string' },
    name: { type: 'string' },
    category: { type: 'string' },
    description: { type: 'string', optional: true },
    parentId: { type: 'string', optional: true },
    isActive: { type: 'boolean' },
    xeroAccountId: { type: 'string', optional: true },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
  },
  primaryKey: 'id',
} as const satisfies TableSchema

const agencyClientsSchema = {
  tableName: 'agency_clients',
  columns: {
    id: { type: 'string' },
    name: { type: 'string' },
    xeroContactId: { type: 'string', optional: true },
    billingType: { type: 'string' },
    retainerAmount: { type: 'number', optional: true },
    paymentTerms: { type: 'number' },
    hourlyRate: { type: 'number', optional: true },
    mediaCommissionRate: { type: 'number', optional: true },
    isActive: { type: 'boolean' },
    notes: { type: 'string', optional: true },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
  },
  primaryKey: 'id',
} as const satisfies TableSchema

const teamMembersSchema = {
  tableName: 'team_members',
  columns: {
    id: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string' },
    role: { type: 'string', optional: true },
    defaultHourlyRate: { type: 'number', optional: true },
    targetUtilization: { type: 'number' },
    isActive: { type: 'boolean' },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
  },
  primaryKey: 'id',
} as const satisfies TableSchema

const projectsSchema = {
  tableName: 'projects',
  columns: {
    id: { type: 'string' },
    clientId: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', optional: true },
    budgetAmount: { type: 'number' },
    budgetType: { type: 'string' },
    startDate: { type: 'string' },
    endDate: { type: 'string', optional: true },
    status: { type: 'string' },
    projectManagerId: { type: 'string', optional: true },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    client: {
      sourceField: 'clientId',
      destSchema: () => agencyClientsSchema,
      destField: 'id',
    },
    projectManager: {
      sourceField: 'projectManagerId',
      destSchema: () => teamMembersSchema,
      destField: 'id',
    },
  },
} as const satisfies TableSchema

const timeEntriesSchema = {
  tableName: 'time_entries',
  columns: {
    id: { type: 'string' },
    projectId: { type: 'string' },
    userId: { type: 'string' },
    date: { type: 'string' },
    hours: { type: 'number' },
    billable: { type: 'boolean' },
    hourlyRate: { type: 'number' },
    description: { type: 'string', optional: true },
    approved: { type: 'boolean' },
    invoiced: { type: 'boolean' },
    invoiceId: { type: 'string', optional: true },
    createdAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    project: {
      sourceField: 'projectId',
      destSchema: () => projectsSchema,
      destField: 'id',
    },
    user: {
      sourceField: 'userId',
      destSchema: () => teamMembersSchema,
      destField: 'id',
    },
  },
} as const satisfies TableSchema

const projectExpensesSchema = {
  tableName: 'project_expenses',
  columns: {
    id: { type: 'string' },
    projectId: { type: 'string', optional: true },
    clientId: { type: 'string', optional: true },
    accountCode: { type: 'string', optional: true },
    category: { type: 'string' },
    description: { type: 'string' },
    amount: { type: 'number' },
    billable: { type: 'boolean' },
    markup: { type: 'number', optional: true },
    date: { type: 'string' },
    vendorName: { type: 'string', optional: true },
    xeroInvoiceId: { type: 'string', optional: true },
    approved: { type: 'boolean' },
    invoiced: { type: 'boolean' },
    createdAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    project: {
      sourceField: 'projectId',
      destSchema: () => projectsSchema,
      destField: 'id',
    },
    client: {
      sourceField: 'clientId',
      destSchema: () => agencyClientsSchema,
      destField: 'id',
    },
  },
} as const satisfies TableSchema

const mediaSpendSchema = {
  tableName: 'media_spend',
  columns: {
    id: { type: 'string' },
    clientId: { type: 'string' },
    projectId: { type: 'string', optional: true },
    platform: { type: 'string' },
    budgetAllocated: { type: 'number' },
    actualSpend: { type: 'number' },
    commissionRate: { type: 'number' },
    commissionAmount: { type: 'number' },
    period: { type: 'string' },
    reconciled: { type: 'boolean' },
    notes: { type: 'string', optional: true },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    client: {
      sourceField: 'clientId',
      destSchema: () => agencyClientsSchema,
      destField: 'id',
    },
    project: {
      sourceField: 'projectId',
      destSchema: () => projectsSchema,
      destField: 'id',
    },
  },
} as const satisfies TableSchema

const agencyInvoicesSchema = {
  tableName: 'agency_invoices',
  columns: {
    id: { type: 'string' },
    clientId: { type: 'string' },
    projectId: { type: 'string', optional: true },
    invoiceNumber: { type: 'string' },
    xeroInvoiceId: { type: 'string', optional: true },
    status: { type: 'string' },
    issueDate: { type: 'string' },
    dueDate: { type: 'string' },
    subtotal: { type: 'number' },
    tax: { type: 'number' },
    total: { type: 'number' },
    paidAmount: { type: 'number' },
    notes: { type: 'string', optional: true },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    client: {
      sourceField: 'clientId',
      destSchema: () => agencyClientsSchema,
      destField: 'id',
    },
    project: {
      sourceField: 'projectId',
      destSchema: () => projectsSchema,
      destField: 'id',
    },
  },
} as const satisfies TableSchema

const retainerPeriodsSchema = {
  tableName: 'retainer_periods',
  columns: {
    id: { type: 'string' },
    clientId: { type: 'string' },
    period: { type: 'string' },
    retainerAmount: { type: 'number' },
    hoursIncluded: { type: 'number', optional: true },
    hoursUsed: { type: 'number' },
    amountUsed: { type: 'number' },
    rolloverHours: { type: 'number', optional: true },
    rolloverAmount: { type: 'number', optional: true },
    status: { type: 'string' },
    invoiceId: { type: 'string', optional: true },
    createdAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    client: {
      sourceField: 'clientId',
      destSchema: () => agencyClientsSchema,
      destField: 'id',
    },
    invoice: {
      sourceField: 'invoiceId',
      destSchema: () => agencyInvoicesSchema,
      destField: 'id',
    },
  },
} as const satisfies TableSchema

// ============================================
// Create Schema
// ============================================

export const schema = createSchema({
  version: 1,
  tables: {
    chartOfAccounts: chartOfAccountsSchema,
    agencyClients: agencyClientsSchema,
    teamMembers: teamMembersSchema,
    projects: projectsSchema,
    timeEntries: timeEntriesSchema,
    projectExpenses: projectExpensesSchema,
    mediaSpend: mediaSpendSchema,
    agencyInvoices: agencyInvoicesSchema,
    retainerPeriods: retainerPeriodsSchema,
  },
})

// ============================================
// Permissions
// For now, allow all authenticated users full access
// In production, implement row-level security
// ============================================

type AuthData = {
  sub: string // user ID from auth provider
}

export const permissions = definePermissions<AuthData, typeof schema>(
  schema,
  () => {
    // For development/MVP: allow all operations for authenticated users
    // In production, add row-level permissions based on user roles
    return {
      chartOfAccounts: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: NOBODY_CAN, // protect COA from deletion
        },
      },
      agencyClients: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: NOBODY_CAN, // soft delete instead
        },
      },
      teamMembers: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: NOBODY_CAN,
        },
      },
      projects: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: NOBODY_CAN,
        },
      },
      timeEntries: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: ANYONE_CAN, // allow deletion of time entries
        },
      },
      projectExpenses: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: ANYONE_CAN,
        },
      },
      mediaSpend: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: ANYONE_CAN,
        },
      },
      agencyInvoices: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: NOBODY_CAN, // invoices should be voided, not deleted
        },
      },
      retainerPeriods: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: NOBODY_CAN,
        },
      },
    }
  }
)

// Export types for use in components
export type Schema = typeof schema
export type ChartOfAccount = typeof chartOfAccountsSchema
export type AgencyClient = typeof agencyClientsSchema
export type TeamMember = typeof teamMembersSchema
export type Project = typeof projectsSchema
export type TimeEntry = typeof timeEntriesSchema
export type ProjectExpense = typeof projectExpensesSchema
export type MediaSpend = typeof mediaSpendSchema
export type AgencyInvoice = typeof agencyInvoicesSchema
export type RetainerPeriod = typeof retainerPeriodsSchema
