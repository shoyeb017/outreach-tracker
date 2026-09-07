export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type SubjectStrategy = "template" | "spreadsheet" | "spreadsheet_fallback";
export type SendStatus = "queued" | "sending" | "sent" | "failed" | "skipped" | "cancelled" | "simulated";

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface SignatureField {
  id: string;
  user_id: string;
  label: string;
  value: string;
  field_type: "text" | "email" | "phone" | "url" | "image";
  display_order: number;
  enabled: boolean;
  show_label: boolean;
  clickable: boolean;
  url: string | null;
  style_preference: Record<string, Json>;
}

export interface Dataset {
  id: string;
  name: string;
  source_file_name: string | null;
  source_sheet_name: string | null;
  row_count: number;
  valid_email_count: number;
  missing_email_count: number;
  invalid_email_count: number;
  routing_column_id: string | null;
  fallback_template_id: string | null;
  subject_strategy: SubjectStrategy;
  original_file_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface DatasetColumn {
  id: string;
  dataset_id: string;
  original_label: string;
  placeholder_slug: string;
  standard_field: string | null;
  display_order: number;
  data_type: string;
}

export interface DatasetPlaceholderMapping {
  id: string;
  user_id: string;
  dataset_id: string;
  placeholder: string;
  column_id: string;
  created_at: string;
  updated_at: string;
}

export interface DatasetRow {
  id: string;
  dataset_id: string;
  row_number: number;
  original_data: Record<string, unknown>;
  data: Record<string, unknown>;
  recipient_email: string | null;
  email_normalized: string | null;
  email_valid: boolean;
  routing_value: string | null;
  subject_value: string | null;
  template_override_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplate {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  category: string | null;
  subject_template: string;
  html_body: string;
  plain_text_body: string | null;
  signature_behavior: "append" | "token_only" | "none";
  is_system: boolean;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoutingRule {
  id: string;
  user_id: string;
  dataset_id: string;
  routing_value: string;
  normalized_value: string;
  template_id: string | null;
  action: "template" | "fallback" | "skip";
  created_at: string;
  updated_at: string;
}

export interface MicrosoftIntegration {
  id: string;
  user_id: string;
  tenant_id: string;
  client_id: string;
  expected_email: string | null;
  connected_email: string | null;
  connection_status: "not_connected" | "connected" | "permission_required" | "error";
  last_connected_at: string | null;
  last_error: string | null;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  live_sending_enabled: boolean;
  send_concurrency: number;
  delay_between_sends_ms: number;
  duplicate_policy: "warn" | "block_template_recipient" | "allow";
  default_subject_strategy: SubjectStrategy;
  default_signature: boolean;
  keep_original_file: boolean;
  send_test_recipient: string | null;
  live_send_confirmation: boolean;
  appearance: Json;
}

export interface SendQueueItem {
  id: string;
  rowId: string;
  recipientEmail: string;
  recipientName?: string;
  templateId: string;
  subject: string;
  htmlBody: string;
  plainTextBody: string;
  status: SendStatus;
  attempts: number;
  error?: string;
}

export interface SendRun {
  id: string;
  user_id: string;
  dataset_id: string;
  status: "queued" | "running" | "paused" | "completed" | "cancelled";
  selected_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  is_test: boolean;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface SendRunItem {
  id: string;
  send_run_id: string;
  dataset_row_id: string;
  recipient_email: string;
  template_id: string | null;
  resolved_subject: string;
  resolved_html_body: string;
  resolved_plain_text_body: string | null;
  status: SendStatus;
  attempts: number;
  error_message: string | null;
  sent_at: string | null;
}

export interface EmailHistory {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  company_name: string | null;
  subject: string;
  final_html_body: string;
  final_plain_text_body: string | null;
  sender_microsoft_email: string | null;
  status: SendStatus;
  error_message: string | null;
  sent_at: string;
}
