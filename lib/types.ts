export type UserRole = "admin" | "staff" | "client";

export type AuditStatus =
  | "awaiting_questionnaire"
  | "audit_running"
  | "awaiting_review"
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
}

export interface FieldDefinition {
  id: string;
  entity: "client" | "questionnaire";
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
