export type HealthStatus = "green" | "yellow" | "red" | "gray";

export type ServiceKey =
  | "backend"
  | "frontend"
  | "domains"
  | "supabase"
  | "anthropic"
  | "whatsapp"
  | "wompi"
  | "resend"
  | "external";

export interface SubCheckResult {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  details?: string;
  error?: string;
}

export interface ServiceCheckResult {
  key: ServiceKey;
  name: string;
  category: "core" | "infrastructure" | "ai" | "notifications" | "payments" | "external";
  status: HealthStatus;
  latencyMs: number;
  lastChecked: string;
  errorMessage?: string;
  details: {
    endpoint?: string;
    subChecks?: SubCheckResult[];
    meta?: Record<string, unknown>;
  };
}

export interface MonitorSummary {
  total: number;
  green: number;
  yellow: number;
  red: number;
  gray: number;
  avgLatencyMs: number;
  hasCriticalIncident: boolean;
  lastRunAt: string;
}

export interface StoredHealthCheck {
  id?: string;
  service_key: string;
  service_name: string;
  status: HealthStatus;
  latency_ms: number;
  error_message?: string | null;
  details: Record<string, unknown>;
  checked_at: string;
}
