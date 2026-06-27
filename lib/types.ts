export type UserRole = "admin" | "staff" | "client";

export type AuditStatus =
  | "awaiting_questionnaire"
  | "audit_running"
  | "awaiting_review"
  | "awaiting_client_followup"
  | "followup_received"
  | "awaiting_answers"
  | "answers_received"
  | "final_review"
  | "approved"
  | "sent"
  | "failed"
  | "archived";

export type FinalTier = "Starter" | "Standard" | "Growth" | "Established" | "Enterprise";

export type RAG = "RED" | "AMBER" | "GREEN";

export type FieldType =
  | "text"
  | "number"
  | "email"
  | "boolean"
  | "select"
  | "multiselect"
  | "long_text"
  | "date";

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

export interface Client {
  id: string;
  email: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  sector: string | null;
  website_url: string | null;
  consent_captured: boolean;
  consent_captured_at: string | null;
  call_date: string | null;
  shay_notes: string | null;
  created_at: string;
  created_by: string | null;
  deleted_at: string | null;
}

export interface Audit {
  id: string;
  client_id: string;
  status: AuditStatus;
  transcript_path: string | null;
  pdf_path: string | null;
  total_opportunity_gbp: number | null;
  final_tier: FinalTier | null;
  flagged_for_review: boolean;
  flag_reasons: string[] | null;
  created_at: string;
  questionnaire_submitted_at: string | null;
  audit_run_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  sent_at: string | null;
  deleted_at: string | null;
  is_current: boolean;
  rebuild_count: number;
}

export interface AuditCategory {
  id: string;
  audit_id: string;
  category_number: number;
  category_name: string;
  score: number | null;
  rag: RAG | null;
  confidence: number | null;
  gbp_impact_annual: number | null;
  gbp_calculation: string | null;
  evidence: string | null;
  solution_category: string | null;
  report_section: string | null;
  insufficient_data: boolean;
  used_defaults: boolean;
  contradiction_flag: boolean;
  created_at: string;
  missing_questions: string[] | null;
  model: string | null;
  latency_ms: number | null;
  raw_response: Record<string, unknown> | null;
  error_text: string | null;
  prompt_version: string | null;
}

export interface FieldDefinition {
  id: string;
  entity: "client" | "questionnaire" | "discovery_call";
  category: number | null;
  field_key: string;
  label: string;
  field_type: FieldType;
  options: Array<{ value: string; label: string }> | null;
  required: boolean;
  display_order: number;
  help_text: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Questionnaire {
  id: string;
  audit_id: string;
  submitted_at: string;
  data: Record<string, unknown>;
}

export interface DiscoveryCall {
  id: string;
  audit_id: string;
  call_date: string | null;
  call_number: number | null;
  recording_consent_captured: boolean;
  years_in_business: number | null;
  turnover_band: string | null;
  lead_source: string | null;
  rough_enquiries_per_month: number | null;
  rough_missed_calls_per_month: number | null;
  rough_conversion_percent: number | null;
  average_customer_value: number | null;
  rough_admin_hours_per_week: number | null;
  total_staff: number | null;
  sites: number | null;
  anything_else_worth_knowing: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ClientFollowup {
  id: string;
  audit_id: string;
  response_text: string;
  source: "email_form" | "manual";
  submitted_at: string;
  submitted_by_user_id: string | null;
  created_at: string;
}
