import { runAllChecks } from "./checker.js";
import { saveCheckResults } from "./storage.js";
import type { ServiceCheckResult, MonitorSummary } from "./types.js";

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

let latestResults: Record<string, ServiceCheckResult> | null = null;
let isRunning = false;
let timer: NodeJS.Timeout | null = null;

// Compute high-level monitor summary
export function computeSummary(results: Record<string, ServiceCheckResult>): MonitorSummary {
  const list = Object.values(results);
  let green = 0;
  let yellow = 0;
  let red = 0;
  let gray = 0;
  let totalLatency = 0;
  let activeLatencyCount = 0;

  for (const item of list) {
    if (item.status === "green") green++;
    else if (item.status === "yellow") yellow++;
    else if (item.status === "red") red++;
    else if (item.status === "gray") gray++;

    if (item.status !== "gray" && item.latencyMs > 0) {
      totalLatency += item.latencyMs;
      activeLatencyCount++;
    }
  }

  return {
    total: list.length,
    green,
    yellow,
    red,
    gray,
    avgLatencyMs: activeLatencyCount > 0 ? Math.round(totalLatency / activeLatencyCount) : 0,
    hasCriticalIncident: red > 0,
    lastRunAt: new Date().toISOString(),
  };
}

export async function executeChecks(): Promise<Record<string, ServiceCheckResult>> {
  if (isRunning && latestResults) {
    return latestResults;
  }

  isRunning = true;
  try {
    const results = await runAllChecks();
    latestResults = results;
    await saveCheckResults(results);
    return results;
  } finally {
    isRunning = false;
  }
}

export function getLatestState(): {
  summary: MonitorSummary | null;
  services: Record<string, ServiceCheckResult> | null;
  isChecking: boolean;
} {
  return {
    summary: latestResults ? computeSummary(latestResults) : null,
    services: latestResults,
    isChecking: isRunning,
  };
}

export function startScheduler(): void {
  // Execute immediately on startup
  executeChecks().catch((err) => {
    console.error("Initial health check run failed:", err);
  });

  // Schedule recurring checks every 10 minutes
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    executeChecks().catch((err) => {
      console.error("Scheduled health check run failed:", err);
    });
  }, CHECK_INTERVAL_MS);
}
