export interface SocialLiveReview {
  id: string
  post_id: string
  account_id: string
  provider_post_id: string
  account_name: string
  action: 'edit' | 'remove'
  before_message: string
  after_message: string | null
  status: string
  expired: boolean
  feedback: string | null
  requester_name: string | null
  responder_name: string | null
  created_at: string
  expires_at: string
  responded_at: string | null
  operation_status: string | null
  operator_name: string | null
  operation_created_at: string | null
}
