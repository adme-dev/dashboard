// server/utils/email-marketing/types.ts
// Shared types for the email marketing module (Phase 1).

export type SubscriberStatus = 'enabled' | 'disabled' | 'blocklisted'
export type MembershipStatus = 'unconfirmed' | 'confirmed' | 'unsubscribed'
export type MembershipSource = 'import' | 'form' | 'manual' | 'leads' | 'clients'
export type ConsentEventType =
  | 'form_submitted'
  | 'confirmed'
  | 'imported'
  | 'manual_added'
  | 'list_unsubscribed'
  | 'global_unsubscribed'
  | 'resubscribed'
export type ConsentEventSource =
  | 'form'
  | 'import'
  | 'manual'
  | 'leads'
  | 'clients'
  | 'preference_center'
  | 'one_click'
  | 'webhook'
  | 'system'
export type SuppressionReason =
  | 'hard_bounce'
  | 'complaint'
  | 'manual'
  | 'global_unsubscribe'
  | 'soft_bounce'
export type SuppressionAuditAction = 'added' | 'ignored' | 'removed' | 'recorded'
export type SuppressionAuditSource =
  | 'webhook'
  | 'one_click'
  | 'preference_center'
  | 'manual'
  | 'system'

export interface EmailSubscriber {
  id: string
  email: string
  name: string | null
  attribs: Record<string, unknown>
  status: SubscriberStatus
  client_id: string | null
  created_by: string | null
  soft_bounce_count?: number
  last_soft_bounce_at?: string | null
  created_at: string
  updated_at: string
}

export interface EmailList {
  id: string
  name: string
  description: string | null
  client_id: string | null
  double_optin: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

// Minimal shape used when upserting a subscriber (from manual add or import).
export interface SubscriberInput {
  email: string
  name?: string | null
  attribs?: Record<string, unknown>
}
