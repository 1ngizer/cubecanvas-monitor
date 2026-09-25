import { supabaseAdmin } from "./auth.js";
import type { ServiceCheckResult, StoredHealthCheck } from "./types.js";

// In-memory ring buffer for check history (fallback & fast timeline cache)
// 9 services * 6 checks/hour * 24 hours = ~1300 records for 24h
const MAX_MEMORY_HISTORY = 1500;
const memoryHistory: StoredHealthCheck[] = [];

// Save results to in-memory buffer and Supabase (if table exists)
export async function saveCheckResults(results: Record<string, ServiceCheckResult>): Promise<void> {
  const records: StoredHealthCheck[] = Object.values(results).map((r) => ({
    service_key: r.key,
    service_name: r.name,
    status: r.status,
    latency_ms: r.latencyMs,
    error_message: r.errorMessage || null,
    details: r.details as Record<string, unknown>,
    checked_at: r.lastChecked,
  }));

  // 1. Add to in-memory buffer
  for (const rec of records) {
    memoryHistory.push(rec);
  }
  if (memoryHistory.length > MAX_MEMORY_HISTORY) {
    memoryHistory.splice(0, memoryHistory.length - MAX_MEMORY_HISTORY);
  }

  // 2. Persist to Supabase if configured
  if (supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin.from("health_checks").insert(records);
      if (error) {
        // Table might not be migrated yet - log once or ignore silently to avoid crashing
        // console.warn("Supabase health_checks insert skipped:", error.message);
      }
    } catch {
      // ignore
    }
  }
}

// Fetch 24-hour history (from Supabase if available, else from in-memory ring buffer)
export async function get24hHistory(): Promise<StoredHealthCheck[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from("health_checks")
        .select("*")
        .gte("checked_at", since)
        .order("checked_at", { ascending: true });

      if (!error && data && data.length > 0) {
        return data as StoredHealthCheck[];
      }
    } catch {
      // fallback to memory
    }
  }

  // Fallback to in-memory buffer
  const sinceTime = Date.now() - 24 * 60 * 60 * 1000;
  return memoryHistory.filter((rec) => new Date(rec.checked_at).getTime() >= sinceTime);
}
