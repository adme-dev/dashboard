/**
 * Zero Schema Definition
 * Defines the client-side schema for Zero sync engine
 * Maps to the Postgres schema in server/database/schema.sql
 */

import {
  createSchema,
  definePermissions,
  type ExpressionBuilder,
  NOBODY_CAN,
  ANYONE_CAN,
} from '@rocicorp/zero'

// ============================================
// Original Agency Tables
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
} as const

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
} as const

const teamMembersSchema = {
  tableName: 'team_members',
  columns: {
    id: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string' },
    role: { type: 'string', optional: true },
    departmentId: { type: 'string', optional: true },
    defaultHourlyRate: { type: 'number', optional: true },
    targetUtilization: { type: 'number' },
    isActive: { type: 'boolean' },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
  },
  primaryKey: 'id',
} as const

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
} as const

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
} as const

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
} as const

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
} as const

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
} as const

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
} as const

// ============================================
// Workflow Management Tables (Monday.com style)
// ============================================

const departmentsSchema = {
  tableName: 'departments',
  columns: {
    id: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    description: { type: 'string', optional: true },
    color: { type: 'string' },
    icon: { type: 'string', optional: true },
    managerId: { type: 'string', optional: true },
    isActive: { type: 'boolean' },
    sortOrder: { type: 'number' },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    manager: {
      sourceField: 'managerId',
      destSchema: () => teamMembersSchema,
      destField: 'id',
    },
  },
} as const

const departmentMembersSchema = {
  tableName: 'department_members',
  columns: {
    id: { type: 'string' },
    departmentId: { type: 'string' },
    teamMemberId: { type: 'string' },
    role: { type: 'string' },
    isPrimary: { type: 'boolean' },
    createdAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    department: {
      sourceField: 'departmentId',
      destSchema: () => departmentsSchema,
      destField: 'id',
    },
    teamMember: {
      sourceField: 'teamMemberId',
      destSchema: () => teamMembersSchema,
      destField: 'id',
    },
  },
} as const

const taskStatusesSchema = {
  tableName: 'task_statuses',
  columns: {
    id: { type: 'string' },
    departmentId: { type: 'string', optional: true },
    name: { type: 'string' },
    slug: { type: 'string' },
    color: { type: 'string' },
    icon: { type: 'string', optional: true },
    category: { type: 'string' },
    isDefault: { type: 'boolean' },
    isFinal: { type: 'boolean' },
    sortOrder: { type: 'number' },
    createdAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    department: {
      sourceField: 'departmentId',
      destSchema: () => departmentsSchema,
      destField: 'id',
    },
  },
} as const

const tasksSchema = {
  tableName: 'tasks',
  columns: {
    id: { type: 'string' },
    projectId: { type: 'string', optional: true },
    departmentId: { type: 'string' },
    parentTaskId: { type: 'string', optional: true },
    statusId: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string', optional: true },
    priority: { type: 'string' },
    taskType: { type: 'string' },
    assigneeId: { type: 'string', optional: true },
    reporterId: { type: 'string', optional: true },
    dueDate: { type: 'string', optional: true },
    startDate: { type: 'string', optional: true },
    estimatedHours: { type: 'number', optional: true },
    actualHours: { type: 'number', optional: true },
    sortOrder: { type: 'number' },
    isBlocked: { type: 'boolean' },
    blockedReason: { type: 'string', optional: true },
    completedAt: { type: 'number', optional: true },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    project: {
      sourceField: 'projectId',
      destSchema: () => projectsSchema,
      destField: 'id',
    },
    department: {
      sourceField: 'departmentId',
      destSchema: () => departmentsSchema,
      destField: 'id',
    },
    parentTask: {
      sourceField: 'parentTaskId',
      destSchema: () => tasksSchema,
      destField: 'id',
    },
    status: {
      sourceField: 'statusId',
      destSchema: () => taskStatusesSchema,
      destField: 'id',
    },
    assignee: {
      sourceField: 'assigneeId',
      destSchema: () => teamMembersSchema,
      destField: 'id',
    },
    reporter: {
      sourceField: 'reporterId',
      destSchema: () => teamMembersSchema,
      destField: 'id',
    },
  },
} as const

const taskAssigneesSchema = {
  tableName: 'task_assignees',
  columns: {
    id: { type: 'string' },
    taskId: { type: 'string' },
    teamMemberId: { type: 'string' },
    role: { type: 'string' },
    createdAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    task: {
      sourceField: 'taskId',
      destSchema: () => tasksSchema,
      destField: 'id',
    },
    teamMember: {
      sourceField: 'teamMemberId',
      destSchema: () => teamMembersSchema,
      destField: 'id',
    },
  },
} as const

const taskLabelsSchema = {
  tableName: 'task_labels',
  columns: {
    id: { type: 'string' },
    name: { type: 'string' },
    color: { type: 'string' },
    departmentId: { type: 'string', optional: true },
    createdAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    department: {
      sourceField: 'departmentId',
      destSchema: () => departmentsSchema,
      destField: 'id',
    },
  },
} as const

const taskLabelAssignmentsSchema = {
  tableName: 'task_label_assignments',
  columns: {
    taskId: { type: 'string' },
    labelId: { type: 'string' },
    createdAt: { type: 'number' },
  },
  primaryKey: ['taskId', 'labelId'],
  relationships: {
    task: {
      sourceField: 'taskId',
      destSchema: () => tasksSchema,
      destField: 'id',
    },
    label: {
      sourceField: 'labelId',
      destSchema: () => taskLabelsSchema,
      destField: 'id',
    },
  },
} as const

const taskDependenciesSchema = {
  tableName: 'task_dependencies',
  columns: {
    id: { type: 'string' },
    taskId: { type: 'string' },
    dependsOnTaskId: { type: 'string' },
    dependencyType: { type: 'string' },
    createdAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    task: {
      sourceField: 'taskId',
      destSchema: () => tasksSchema,
      destField: 'id',
    },
    dependsOnTask: {
      sourceField: 'dependsOnTaskId',
      destSchema: () => tasksSchema,
      destField: 'id',
    },
  },
} as const

const taskActivitiesSchema = {
  tableName: 'task_activities',
  columns: {
    id: { type: 'string' },
    taskId: { type: 'string' },
    userId: { type: 'string', optional: true },
    activityType: { type: 'string' },
    oldValue: { type: 'json', optional: true },
    newValue: { type: 'json', optional: true },
    content: { type: 'string', optional: true },
    isInternal: { type: 'boolean' },
    createdAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    task: {
      sourceField: 'taskId',
      destSchema: () => tasksSchema,
      destField: 'id',
    },
    user: {
      sourceField: 'userId',
      destSchema: () => teamMembersSchema,
      destField: 'id',
    },
  },
} as const

const taskAttachmentsSchema = {
  tableName: 'task_attachments',
  columns: {
    id: { type: 'string' },
    taskId: { type: 'string' },
    uploadedBy: { type: 'string', optional: true },
    fileName: { type: 'string' },
    fileUrl: { type: 'string' },
    fileType: { type: 'string', optional: true },
    fileSize: { type: 'number', optional: true },
    thumbnailUrl: { type: 'string', optional: true },
    createdAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    task: {
      sourceField: 'taskId',
      destSchema: () => tasksSchema,
      destField: 'id',
    },
    uploader: {
      sourceField: 'uploadedBy',
      destSchema: () => teamMembersSchema,
      destField: 'id',
    },
  },
} as const

// ============================================
// Approval Workflow Tables
// ============================================

const approvalWorkflowsSchema = {
  tableName: 'approval_workflows',
  columns: {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', optional: true },
    departmentId: { type: 'string', optional: true },
    isActive: { type: 'boolean' },
    isDefault: { type: 'boolean' },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    department: {
      sourceField: 'departmentId',
      destSchema: () => departmentsSchema,
      destField: 'id',
    },
  },
} as const

const approvalWorkflowStepsSchema = {
  tableName: 'approval_workflow_steps',
  columns: {
    id: { type: 'string' },
    workflowId: { type: 'string' },
    stepOrder: { type: 'number' },
    name: { type: 'string' },
    description: { type: 'string', optional: true },
    approverType: { type: 'string' },
    approverId: { type: 'string', optional: true },
    approverRole: { type: 'string', optional: true },
    requiredApprovals: { type: 'number' },
    canSkip: { type: 'boolean' },
    autoApproveAfterHours: { type: 'number', optional: true },
    createdAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    workflow: {
      sourceField: 'workflowId',
      destSchema: () => approvalWorkflowsSchema,
      destField: 'id',
    },
    approver: {
      sourceField: 'approverId',
      destSchema: () => teamMembersSchema,
      destField: 'id',
    },
  },
} as const

const taskApprovalsSchema = {
  tableName: 'task_approvals',
  columns: {
    id: { type: 'string' },
    taskId: { type: 'string' },
    workflowId: { type: 'string' },
    currentStepId: { type: 'string', optional: true },
    status: { type: 'string' },
    startedAt: { type: 'number' },
    completedAt: { type: 'number', optional: true },
    createdAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    task: {
      sourceField: 'taskId',
      destSchema: () => tasksSchema,
      destField: 'id',
    },
    workflow: {
      sourceField: 'workflowId',
      destSchema: () => approvalWorkflowsSchema,
      destField: 'id',
    },
    currentStep: {
      sourceField: 'currentStepId',
      destSchema: () => approvalWorkflowStepsSchema,
      destField: 'id',
    },
  },
} as const

const taskApprovalResponsesSchema = {
  tableName: 'task_approval_responses',
  columns: {
    id: { type: 'string' },
    taskApprovalId: { type: 'string' },
    workflowStepId: { type: 'string' },
    respondedBy: { type: 'string', optional: true },
    response: { type: 'string', optional: true },
    comments: { type: 'string', optional: true },
    respondedAt: { type: 'number', optional: true },
    createdAt: { type: 'number' },
  },
  primaryKey: 'id',
  relationships: {
    taskApproval: {
      sourceField: 'taskApprovalId',
      destSchema: () => taskApprovalsSchema,
      destField: 'id',
    },
    workflowStep: {
      sourceField: 'workflowStepId',
      destSchema: () => approvalWorkflowStepsSchema,
      destField: 'id',
    },
    responder: {
      sourceField: 'respondedBy',
      destSchema: () => teamMembersSchema,
      destField: 'id',
    },
  },
} as const

// ============================================
// Create Schema
// ============================================

export const schema = (createSchema as any)({
  version: 2, // Bumped version for workflow tables
  tables: {
    // Original agency tables
    chartOfAccounts: chartOfAccountsSchema,
    agencyClients: agencyClientsSchema,
    teamMembers: teamMembersSchema,
    projects: projectsSchema,
    timeEntries: timeEntriesSchema,
    projectExpenses: projectExpensesSchema,
    mediaSpend: mediaSpendSchema,
    agencyInvoices: agencyInvoicesSchema,
    retainerPeriods: retainerPeriodsSchema,
    // Workflow tables
    departments: departmentsSchema,
    departmentMembers: departmentMembersSchema,
    taskStatuses: taskStatusesSchema,
    tasks: tasksSchema,
    taskAssignees: taskAssigneesSchema,
    taskLabels: taskLabelsSchema,
    taskLabelAssignments: taskLabelAssignmentsSchema,
    taskDependencies: taskDependenciesSchema,
    taskActivities: taskActivitiesSchema,
    taskAttachments: taskAttachmentsSchema,
    // Approval workflow tables
    approvalWorkflows: approvalWorkflowsSchema,
    approvalWorkflowSteps: approvalWorkflowStepsSchema,
    taskApprovals: taskApprovalsSchema,
    taskApprovalResponses: taskApprovalResponsesSchema,
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
      // Original agency tables
      chartOfAccounts: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: NOBODY_CAN,
        },
      },
      agencyClients: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: NOBODY_CAN,
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
          delete: ANYONE_CAN,
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
          delete: NOBODY_CAN,
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
      // Workflow tables
      departments: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: NOBODY_CAN,
        },
      },
      departmentMembers: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: ANYONE_CAN,
        },
      },
      taskStatuses: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: NOBODY_CAN,
        },
      },
      tasks: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: ANYONE_CAN,
        },
      },
      taskAssignees: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: ANYONE_CAN,
        },
      },
      taskLabels: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: ANYONE_CAN,
        },
      },
      taskLabelAssignments: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: ANYONE_CAN,
        },
      },
      taskDependencies: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: ANYONE_CAN,
        },
      },
      taskActivities: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: NOBODY_CAN, // Activities are audit log, don't delete
        },
      },
      taskAttachments: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: ANYONE_CAN,
        },
      },
      // Approval workflow tables
      approvalWorkflows: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: NOBODY_CAN,
        },
      },
      approvalWorkflowSteps: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: ANYONE_CAN,
        },
      },
      taskApprovals: {
        row: {
          select: ANYONE_CAN,
          insert: ANYONE_CAN,
          update: {
            preMutation: ANYONE_CAN,
          },
          delete: NOBODY_CAN,
        },
      },
      taskApprovalResponses: {
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
// Workflow types
export type Department = typeof departmentsSchema
export type DepartmentMember = typeof departmentMembersSchema
export type TaskStatus = typeof taskStatusesSchema
export type Task = typeof tasksSchema
export type TaskAssignee = typeof taskAssigneesSchema
export type TaskLabel = typeof taskLabelsSchema
export type TaskLabelAssignment = typeof taskLabelAssignmentsSchema
export type TaskDependency = typeof taskDependenciesSchema
export type TaskActivity = typeof taskActivitiesSchema
export type TaskAttachment = typeof taskAttachmentsSchema
export type ApprovalWorkflow = typeof approvalWorkflowsSchema
export type ApprovalWorkflowStep = typeof approvalWorkflowStepsSchema
export type TaskApproval = typeof taskApprovalsSchema
export type TaskApprovalResponse = typeof taskApprovalResponsesSchema
