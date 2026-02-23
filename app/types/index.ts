// ============================================
// User Types
// ============================================
export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'project_manager' | 'consultant' | 'client' | 'owner' | 'sales' | 'member' | 'viewer' | 'guest'
  is_active?: boolean
  avatar_url?: string
}

// ============================================
// Implementation Types
// ============================================
export interface Implementation {
  id: string
  client_id: string
  client_name: string
  xero_organization_id: string | null
  xero_connection_status: 'pending' | 'connected' | 'disconnected' | 'error'
  implementation_type: 'new_setup' | 'migration' | 'cleanup' | 'training_only'
  industry_template: string
  company_type: string
  status: 'not_started' | 'setup_phase' | 'in_progress' | 'review' | 'go_live' | 'complete' | 'on_hold'
  progress_percent: number
  start_date: string | null
  target_date: string | null
  go_live_date: string | null
  completed_date: string | null
  project_manager_id: string | null
  project_manager_name: string | null
  assigned_consultant_id: string | null
  assigned_consultant_name: string | null
  client_portal_enabled: boolean
  priority: 'low' | 'medium' | 'high' | 'urgent'
  estimated_hours: number
  actual_hours: number
  notes: string
  created_at: string
  updated_at: string
  // Computed
  completed_tasks?: number
  total_tasks?: number
}

// ============================================
// Task Types
// ============================================
export interface Task {
  id: string
  implementation_id: string
  name: string
  description: string | null
  category: 'setup' | 'configuration' | 'data_migration' | 'training' | 'review' | 'go_live' | 'support'
  status: 'not_started' | 'in_progress' | 'blocked' | 'review' | 'complete' | 'skipped'
  assigned_to_id: string | null
  assigned_to_name: string | null
  due_date: string | null
  started_at: string | null
  completed_at: string | null
  estimated_hours: number | null
  actual_hours: number
  sort_order: number
  checklist_items: ChecklistItem[]
  checklist_progress: number
  show_to_client: boolean
  client_notes: string | null
  is_blocked: boolean
  blocked_reason: string | null
  created_at: string
  updated_at: string
}

export interface ChecklistItem {
  id: string
  text: string
  completed: boolean
}

// ============================================
// Template Types
// ============================================
export interface Template {
  id: string
  name: string
  description: string | null
  template_type: string
  company_type: string
  estimated_duration_days: number
  default_priority: string
  is_system_template: boolean
  is_active: boolean
  usage_count: number
  created_at: string
  tasks?: TemplateTask[]
}

export interface TemplateTask {
  id: string
  template_id: string
  name: string
  description: string | null
  sort_order: number
  category: string
  estimated_hours: number | null
  default_assignee_role: string
  checklist_items: ChecklistItem[]
  is_required: boolean
  client_description: string | null
  show_to_client: boolean
}

// ============================================
// Comment Types
// ============================================
export interface Comment {
  id: string
  task_id: string
  author_id: string | null
  author_name: string | null
  author_type: 'team_member' | 'client' | 'system'
  content: string
  comment_type: string
  is_internal: boolean
  created_at: string
}

// ============================================
// Document Types
// ============================================
export interface Document {
  id: string
  implementation_id: string
  task_id: string | null
  file_name: string
  file_type: string
  file_size_bytes: number
  file_url: string
  document_type: string
  description: string | null
  uploaded_by_name: string | null
  created_at: string
}

// ============================================
// Stats Types
// ============================================
export interface DashboardStats {
  activeImplementations: number
  completedThisMonth: number
  averageCompletionTime: number
  totalHoursLogged: number
  teamWorkload: TeamMemberWorkload[]
}

export interface TeamMemberWorkload {
  id: string
  name: string
  activeImplementations: number
  pendingTasks: number
  estimatedHoursRemaining: number
  overdueTasks: number
}
