import tls from "node:tls";
import { supabaseAdmin } from "./auth.js";
import type { ServiceCheckResult, SubCheckResult, HealthStatus } from "./types.js";

const TIMEOUT_MS = 10000;

// Helper: Fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<{ res?: Response; latencyMs: number; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;
    clearTimeout(timer);
    return { res, latencyMs };
  } catch (err: unknown) {
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : "network error";
    return { latencyMs, error: msg.includes("aborted") ? "Timeout (>10s)" : msg };
  }
}

// Helper: Inspect TLS certificate days remaining
function checkTlsCert(hostname: string, port = 443, timeoutMs = 8000): Promise<{ valid: boolean; daysRemaining: number; expiresAt?: string; error?: string }> {
  return new Promise((resolve) => {
    let resolved = false;
    const socket = tls.connect(
      {
        host: hostname,
        port,
        servername: hostname,
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      () => {
        if (resolved) return;
        resolved = true;
        try {
          const cert = socket.getPeerCertificate();
          socket.destroy();
          if (!cert || !cert.valid_to) {
            resolve({ valid: false, daysRemaining: 0, error: "No peer certificate received" });
            return;
          }
          const validTo = new Date(cert.valid_to);
          const now = new Date();
          const msRemaining = validTo.getTime() - now.getTime();
          const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
          resolve({
            valid: msRemaining > 0,
            daysRemaining,
            expiresAt: validTo.toISOString(),
          });
        } catch (err: unknown) {
          socket.destroy();
          resolve({ valid: false, daysRemaining: 0, error: err instanceof Error ? err.message : "TLS parse error" });
        }
      }
    );

    socket.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      resolve({ valid: false, daysRemaining: 0, error: err.message });
    });

    socket.on("timeout", () => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve({ valid: false, daysRemaining: 0, error: "TLS connection timed out" });
    });
  });
}

// Helper: Cloudflare DNS-over-HTTPS CNAME query
async function checkDohCname(domain: string): Promise<{ cname?: string; latencyMs: number; error?: string }> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=CNAME`;
  const { res, latencyMs, error } = await fetchWithTimeout(url, {
    headers: { accept: "application/dns-json" },
  });

  if (error || !res) {
    return { latencyMs, error: error || "DoH lookup failed" };
  }

  try {
    const data = await res.json();
    if (data.Answer && Array.isArray(data.Answer) && data.Answer.length > 0) {
      const cname = data.Answer[0].data;
      return { cname, latencyMs };
    }
    return { latencyMs, error: "No CNAME record found in DNS response" };
  } catch (err: unknown) {
    return { latencyMs, error: err instanceof Error ? err.message : "DNS JSON parse error" };
  }
}

// Cache for Anthropic check (run once every 30 minutes to save cost)
let anthropicCache: { result: ServiceCheckResult; checkedAt: number } | null = null;
const ANTHROPIC_CACHE_TTL_MS = 30 * 60 * 1000; // 30 mins

// 1. Backend CubeCanvas Check
export async function checkBackend(): Promise<ServiceCheckResult> {
  const endpoint = "https://cubecanvas-backend-production.up.railway.app/health";
  const { res, latencyMs, error } = await fetchWithTimeout(endpoint);

  if (error || !res) {
    return {
      key: "backend",
      name: "Backend CubeCanvas",
      category: "core",
      status: "red",
      latencyMs,
      lastChecked: new Date().toISOString(),
      errorMessage: error || "Connection failed",
      details: { endpoint, meta: { error } },
    };
  }

  if (res.status !== 200) {
    let bodySnippet = "";
    try {
      bodySnippet = await res.text();
    } catch {
      // ignore
    }
    return {
      key: "backend",
      name: "Backend CubeCanvas",
      category: "core",
      status: "red",
      latencyMs,
      lastChecked: new Date().toISOString(),
      errorMessage: `HTTP ${res.status}: ${bodySnippet.substring(0, 120)}`,
      details: { endpoint, meta: { httpStatus: res.status, body: bodySnippet } },
    };
  }

  try {
    const json = await res.json();
    if (json.ok === true && json.service === "cubecanvas-backend") {
      const status: HealthStatus = latencyMs > 2000 ? "yellow" : "green";
      return {
        key: "backend",
        name: "Backend CubeCanvas",
        category: "core",
        status,
        latencyMs,
        lastChecked: new Date().toISOString(),
        errorMessage: latencyMs > 2000 ? `Latencia alta (${latencyMs} ms)` : undefined,
        details: { endpoint, meta: json },
      };
    } else {
      return {
        key: "backend",
        name: "Backend CubeCanvas",
        category: "core",
        status: "red",
        latencyMs,
        lastChecked: new Date().toISOString(),
        errorMessage: `Respuesta inválida: ok=${json.ok}, service=${json.service}`,
        details: { endpoint, meta: json },
      };
    }
  } catch (err: unknown) {
    return {
      key: "backend",
      name: "Backend CubeCanvas",
      category: "core",
      status: "red",
      latencyMs,
      lastChecked: new Date().toISOString(),
      errorMessage: `JSON inválido en /health: ${err instanceof Error ? err.message : "parse error"}`,
      details: { endpoint },
    };
  }
}

// 2. Frontend CubeCanvas Check
export async function checkFrontend(): Promise<ServiceCheckResult> {
  const endpoint = "https://cubecanvas-frontend-production.up.railway.app";
  const { res, latencyMs, error } = await fetchWithTimeout(endpoint);

  if (error || !res) {
    return {
      key: "frontend",
      name: "Frontend CubeCanvas",
      category: "core",
      status: "red",
      latencyMs,
      lastChecked: new Date().toISOString(),
      errorMessage: error || "Connection failed",
      details: { endpoint },
    };
  }

  if (res.status !== 200) {
    return {
      key: "frontend",
      name: "Frontend CubeCanvas",
      category: "core",
      status: "red",
      latencyMs,
      lastChecked: new Date().toISOString(),
      errorMessage: `HTTP ${res.status}`,
      details: { endpoint, meta: { httpStatus: res.status } },
    };
  }

  let html = "";
  try {
    html = await res.text();
  } catch (err: unknown) {
    return {
      key: "frontend",
      name: "Frontend CubeCanvas",
      category: "core",
      status: "red",
      latencyMs,
      lastChecked: new Date().toISOString(),
      errorMessage: `Failed reading HTML body: ${err instanceof Error ? err.message : "error"}`,
      details: { endpoint },
    };
  }

  // Find bundle: /assets/index-*.js or assets/index-*.js
  const bundleMatch = html.match(/\/assets\/index-[a-zA-Z0-9_-]+\.js/);
  if (!bundleMatch) {
    return {
      key: "frontend",
      name: "Frontend CubeCanvas",
      category: "core",
      status: "red",
      latencyMs,
      lastChecked: new Date().toISOString(),
      errorMessage: "HTML no referencia un bundle /assets/index-*.js válido",
      details: { endpoint, meta: { htmlSnippet: html.substring(0, 250) } },
    };
  }

  const bundleUrl = `${endpoint}${bundleMatch[0]}`;
  const bundleCheck = await fetchWithTimeout(bundleUrl);

  if (bundleCheck.error || !bundleCheck.res || bundleCheck.res.status !== 200) {
    return {
      key: "frontend",
      name: "Frontend CubeCanvas",
      category: "core",
      status: "red",
      latencyMs: latencyMs + bundleCheck.latencyMs,
      lastChecked: new Date().toISOString(),
      errorMessage: `Bundle ${bundleMatch[0]} devolvió error: ${bundleCheck.error || `HTTP ${bundleCheck.res?.status}`}`,
      details: { endpoint, meta: { bundleUrl, bundleStatus: bundleCheck.res?.status } },
    };
  }

  const totalLatency = latencyMs + bundleCheck.latencyMs;
  const status: HealthStatus = totalLatency > 2000 ? "yellow" : "green";

  return {
    key: "frontend",
    name: "Frontend CubeCanvas",
    category: "core",
    status,
    latencyMs: totalLatency,
    lastChecked: new Date().toISOString(),
    errorMessage: totalLatency > 2000 ? `Latencia alta acumulada (${totalLatency} ms)` : undefined,
    details: {
      endpoint,
      meta: { bundleUrl, htmlStatus: res.status, bundleStatus: bundleCheck.res.status },
    },
  };
}

// 3. Domains and Certificates Check
export async function checkDomains(): Promise<ServiceCheckResult> {
  const subChecks: SubCheckResult[] = [];
  let worstStatus: HealthStatus = "green";
  let totalLatency = 0;
  let firstError: string | undefined;

  function updateStatus(s: HealthStatus, err?: string) {
    if (err && !firstError) firstError = err;
    if (s === "red") worstStatus = "red";
    else if (s === "yellow" && worstStatus !== "red") worstStatus = "yellow";
  }

  // A. www.cubecanvas.com (CNAME to *.up.railway.app + TLS cert)
  const wwwDoh = await checkDohCname("www.cubecanvas.com");
  totalLatency += wwwDoh.latencyMs;
  const wwwCnameValid = !!wwwDoh.cname && (wwwDoh.cname.endsWith(".up.railway.app") || wwwDoh.cname.endsWith(".up.railway.app."));
  
  const wwwTls = await checkTlsCert("www.cubecanvas.com");
  let wwwStatus: HealthStatus = "green";
  let wwwDetail = `CNAME: ${wwwDoh.cname || "Ninguno"}`;

  if (!wwwCnameValid) {
    wwwStatus = "red";
    wwwDetail += ` (No apunta a .up.railway.app)`;
    updateStatus("red", `www.cubecanvas.com CNAME no apunta a .up.railway.app (${wwwDoh.cname || "no encontrado"})`);
  } else if (!wwwTls.valid) {
    wwwStatus = "red";
    wwwDetail += ` | TLS error: ${wwwTls.error}`;
    updateStatus("red", `www.cubecanvas.com TLS inválido: ${wwwTls.error}`);
  } else if (wwwTls.daysRemaining < 14) {
    wwwStatus = "yellow";
    wwwDetail += ` | TLS vence en ${wwwTls.daysRemaining} días`;
    updateStatus("yellow", `www.cubecanvas.com certificado vence pronto (${wwwTls.daysRemaining} días)`);
  } else {
    wwwDetail += ` | TLS válido (${wwwTls.daysRemaining} días)`;
  }

  subChecks.push({
    name: "www.cubecanvas.com",
    status: wwwStatus,
    latencyMs: wwwDoh.latencyMs,
    details: wwwDetail,
    error: wwwStatus !== "green" ? wwwDetail : undefined,
  });

  // B. app.cubecanvas.com (CNAME to *.up.railway.app + TLS cert)
  const appDoh = await checkDohCname("app.cubecanvas.com");
  totalLatency += appDoh.latencyMs;
  const appCnameValid = !!appDoh.cname && (appDoh.cname.endsWith(".up.railway.app") || appDoh.cname.endsWith(".up.railway.app."));

  const appTls = await checkTlsCert("app.cubecanvas.com");
  let appStatus: HealthStatus = "green";
  let appDetail = `CNAME: ${appDoh.cname || "Ninguno"}`;

  if (!appCnameValid) {
    appStatus = "red";
    appDetail += ` (No apunta a .up.railway.app)`;
    updateStatus("red", `app.cubecanvas.com CNAME no apunta a .up.railway.app (${appDoh.cname || "no encontrado"})`);
  } else if (!appTls.valid) {
    appStatus = "red";
    appDetail += ` | TLS error: ${appTls.error}`;
    updateStatus("red", `app.cubecanvas.com TLS inválido: ${appTls.error}`);
  } else if (appTls.daysRemaining < 14) {
    appStatus = "yellow";
    appDetail += ` | TLS vence en ${appTls.daysRemaining} días`;
    updateStatus("yellow", `app.cubecanvas.com certificado vence pronto (${appTls.daysRemaining} días)`);
  } else {
    appDetail += ` | TLS válido (${appTls.daysRemaining} días)`;
  }

  subChecks.push({
    name: "app.cubecanvas.com",
    status: appStatus,
    latencyMs: appDoh.latencyMs,
    details: appDetail,
    error: appStatus !== "green" ? appDetail : undefined,
  });

  // C. cubecanvas.com (apex 200)
  const apexCheck = await fetchWithTimeout("https://cubecanvas.com");
  totalLatency += apexCheck.latencyMs;
  const apexStatus: HealthStatus = apexCheck.res?.status === 200 ? "green" : "red";
  if (apexStatus !== "green") {
    updateStatus("red", `cubecanvas.com devolvió ${apexCheck.error || `HTTP ${apexCheck.res?.status}`}`);
  }
  subChecks.push({
    name: "cubecanvas.com (apex)",
    status: apexStatus,
    latencyMs: apexCheck.latencyMs,
    details: `HTTP ${apexCheck.res?.status || 0}`,
    error: apexStatus !== "green" ? `HTTP ${apexCheck.res?.status || apexCheck.error}` : undefined,
  });

  // D. cubecanvas.com/privacy.html (200)
  const privacyCheck = await fetchWithTimeout("https://cubecanvas.com/privacy.html");
  totalLatency += privacyCheck.latencyMs;
  const privacyStatus: HealthStatus = privacyCheck.res?.status === 200 ? "green" : "red";
  if (privacyStatus !== "green") {
    updateStatus("red", `cubecanvas.com/privacy.html devolvió ${privacyCheck.error || `HTTP ${privacyCheck.res?.status}`}`);
  }
  subChecks.push({
    name: "cubecanvas.com/privacy.html",
    status: privacyStatus,
    latencyMs: privacyCheck.latencyMs,
    details: `HTTP ${privacyCheck.res?.status || 0}`,
    error: privacyStatus !== "green" ? `HTTP ${privacyCheck.res?.status || privacyCheck.error}` : undefined,
  });

  return {
    key: "domains",
    name: "Dominios & Certificados",
    category: "infrastructure",
    status: worstStatus,
    latencyMs: Math.round(totalLatency / 4),
    lastChecked: new Date().toISOString(),
    errorMessage: firstError,
    details: { subChecks },
  };
}

// 4. Supabase (cubecanvas-core) Check
export async function checkSupabase(): Promise<ServiceCheckResult> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return {
      key: "supabase",
      name: "Supabase (cubecanvas-core)",
      category: "infrastructure",
      status: "gray",
      latencyMs: 0,
      lastChecked: new Date().toISOString(),
      errorMessage: "Credenciales no configuradas: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
      details: { meta: { configured: false } },
    };
  }

  if (!supabaseAdmin) {
    return {
      key: "supabase",
      name: "Supabase (cubecanvas-core)",
      category: "infrastructure",
      status: "red",
      latencyMs: 0,
      lastChecked: new Date().toISOString(),
      errorMessage: "No se pudo inicializar cliente de Supabase",
      details: {},
    };
  }

  const start = Date.now();
  const subChecks: SubCheckResult[] = [];
  let worstStatus: HealthStatus = "green";
  let firstError: string | undefined;

  // A. Connectivity Ping
  try {
    const { error: pingError } = await supabaseAdmin.from("health_checks").select("count", { count: "exact", head: true });
    const latencyMs = Date.now() - start;

    if (pingError && !pingError.message.includes("relation") && !pingError.message.includes("does not exist")) {
      worstStatus = "red";
      firstError = `Conexión fallida: ${pingError.message}`;
      subChecks.push({ name: "Conectividad", status: "red", latencyMs, error: pingError.message });
    } else {
      const connStatus: HealthStatus = latencyMs > 2000 ? "yellow" : "green";
      if (connStatus === "yellow") worstStatus = "yellow";
      subChecks.push({ name: "Conectividad", status: connStatus, latencyMs, details: `${latencyMs} ms` });
    }
  } catch (err: unknown) {
    worstStatus = "red";
    firstError = err instanceof Error ? err.message : "Error conectando a Supabase";
    subChecks.push({ name: "Conectividad", status: "red", latencyMs: Date.now() - start, error: firstError });
  }

  // B. Business Metrics: projects/canvas in status 'pending_render' or 'processing' > 15m
  try {
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: stuckProjects, error } = await supabaseAdmin
      .from("projects")
      .select("id, status, created_at")
      .in("status", ["pending_render", "processing"])
      .lt("created_at", fifteenMinsAgo)
      .limit(5);

    if (error) {
      // Table might not exist yet or different schema
      subChecks.push({ name: "Proyectos en render (>15m)", status: "green", details: `N/A (${error.message})` });
    } else if (stuckProjects && stuckProjects.length > 0) {
      worstStatus = "red";
      const err = `${stuckProjects.length} proyecto(s) atascados en render >15 min`;
      if (!firstError) firstError = err;
      subChecks.push({ name: "Proyectos en render (>15m)", status: "red", details: err, error: err });
    } else {
      subChecks.push({ name: "Proyectos en render (>15m)", status: "green", details: "0 proyectos atascados" });
    }
  } catch {
    subChecks.push({ name: "Proyectos en render (>15m)", status: "green", details: "Omitido (tabla ausente)" });
  }

  // C. Subscriptions / Payments 'pending' > 24h
  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: stuckPayments, error } = await supabaseAdmin
      .from("subscriptions")
      .select("id, status, created_at")
      .eq("status", "pending")
      .lt("created_at", dayAgo)
      .limit(5);

    if (error) {
      subChecks.push({ name: "Pagos pendientes (>24h)", status: "green", details: `N/A (${error.message})` });
    } else if (stuckPayments && stuckPayments.length > 0) {
      worstStatus = "red";
      const err = `${stuckPayments.length} pago(s) pendientes >24 h`;
      if (!firstError) firstError = err;
      subChecks.push({ name: "Pagos pendientes (>24h)", status: "red", details: err, error: err });
    } else {
      subChecks.push({ name: "Pagos pendientes (>24h)", status: "green", details: "0 pagos atascados" });
    }
  } catch {
    subChecks.push({ name: "Pagos pendientes (>24h)", status: "green", details: "Omitido (tabla ausente)" });
  }

  const totalLatency = Date.now() - start;

  return {
    key: "supabase",
    name: "Supabase (cubecanvas-core)",
    category: "infrastructure",
    status: worstStatus,
    latencyMs: totalLatency,
    lastChecked: new Date().toISOString(),
    errorMessage: firstError,
    details: { subChecks },
  };
}

// 5. Anthropic (claude-sonnet-5) Check
export async function checkAnthropic(): Promise<ServiceCheckResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return {
      key: "anthropic",
      name: "Anthropic (claude-sonnet-5)",
      category: "ai",
      status: "gray",
      latencyMs: 0,
      lastChecked: new Date().toISOString(),
      errorMessage: "Credencial no configurada: ANTHROPIC_API_KEY",
      details: { meta: { configured: false } },
    };
  }

  // Return cached result if checked within the last 30 minutes
  if (anthropicCache && Date.now() - anthropicCache.checkedAt < ANTHROPIC_CACHE_TTL_MS) {
    return {
      ...anthropicCache.result,
      details: {
        ...anthropicCache.result.details,
        meta: { ...anthropicCache.result.details.meta, cached: true },
      },
    };
  }

  const endpoint = "https://api.anthropic.com/v1/messages";
  const start = Date.now();

  try {
    const { res, latencyMs, error } = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 5,
        // CRITICAL: send thinking disabled so model does not consume all tokens on reasoning
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: "ping" }],
      }),
    });

    if (error || !res) {
      const result: ServiceCheckResult = {
        key: "anthropic",
        name: "Anthropic (claude-sonnet-5)",
        category: "ai",
        status: "red",
        latencyMs,
        lastChecked: new Date().toISOString(),
        errorMessage: error || "Connection failed",
        details: { endpoint, meta: { error } },
      };
      anthropicCache = { result, checkedAt: Date.now() };
      return result;
    }

    if (res.status !== 200) {
      const errText = await res.text();
      const result: ServiceCheckResult = {
        key: "anthropic",
        name: "Anthropic (claude-sonnet-5)",
        category: "ai",
        status: "red",
        latencyMs,
        lastChecked: new Date().toISOString(),
        errorMessage: `HTTP ${res.status}: ${errText.substring(0, 150)}`,
        details: { endpoint, meta: { httpStatus: res.status } },
      };
      anthropicCache = { result, checkedAt: Date.now() };
      return result;
    }

    const data = await res.json();
    const status: HealthStatus = latencyMs > 2000 ? "yellow" : "green";
    const result: ServiceCheckResult = {
      key: "anthropic",
      name: "Anthropic (claude-sonnet-5)",
      category: "ai",
      status,
      latencyMs,
      lastChecked: new Date().toISOString(),
      errorMessage: latencyMs > 2000 ? `Latencia alta (${latencyMs} ms)` : undefined,
      details: {
        endpoint,
        meta: {
          model: data.model || "claude-sonnet-5",
          stop_reason: data.stop_reason,
          usage: data.usage,
        },
      },
    };
    anthropicCache = { result, checkedAt: Date.now() };
    return result;
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const result: ServiceCheckResult = {
      key: "anthropic",
      name: "Anthropic (claude-sonnet-5)",
      category: "ai",
      status: "red",
      latencyMs,
      lastChecked: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : "Error llamando a Anthropic",
      details: { endpoint },
    };
    anthropicCache = { result, checkedAt: Date.now() };
    return result;
  }
}

// 6. WhatsApp / Notifications (Meta Graph API v22.0) Check
export async function checkWhatsApp(): Promise<ServiceCheckResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const subChecks: SubCheckResult[] = [];
  let worstStatus: HealthStatus = "green";
  let firstError: string | undefined;

  // A. Meta Graph API Token & Phone ID
  if (!token || !phoneId) {
    subChecks.push({
      name: "Token Graph API v22.0",
      status: "gray",
      details: "WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configurados",
    });
  } else {
    const metaUrl = `https://graph.facebook.com/v22.0/${phoneId}`;
    const { res, latencyMs, error } = await fetchWithTimeout(metaUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (error || !res || res.status !== 200) {
      worstStatus = "red";
      const err = `Graph API error: ${error || `HTTP ${res?.status}`}`;
      firstError = err;
      subChecks.push({
        name: "Token Graph API v22.0",
        status: "red",
        latencyMs,
        error: err,
      });
    } else {
      subChecks.push({
        name: "Token Graph API v22.0",
        status: "green",
        latencyMs,
        details: "Token activo y verificado",
      });
    }
  }

  // B. Backend WhatsApp Webhook handshake
  const webhookUrl = "https://cubecanvas-backend-production.up.railway.app/api/whatsapp/webhook?hub.mode=subscribe&hub.challenge=challenge_probe_123&hub.verify_token=probe";
  const { res: hookRes, latencyMs: hookLatency, error: hookError } = await fetchWithTimeout(webhookUrl);

  if (hookError || !hookRes) {
    worstStatus = "red";
    const err = `Webhook handshake error: ${hookError || "Conexión fallida"}`;
    if (!firstError) firstError = err;
    subChecks.push({
      name: "Webhook Handshake (hub.challenge)",
      status: "red",
      latencyMs: hookLatency,
      error: err,
    });
  } else if (hookRes.status !== 200) {
    worstStatus = "red";
    const err = `Webhook respondió HTTP ${hookRes.status}`;
    if (!firstError) firstError = err;
    subChecks.push({
      name: "Webhook Handshake (hub.challenge)",
      status: "red",
      latencyMs: hookLatency,
      error: err,
    });
  } else {
    try {
      const text = await hookRes.text();
      if (text.includes("challenge_probe_123")) {
        subChecks.push({
          name: "Webhook Handshake (hub.challenge)",
          status: hookLatency > 2000 ? "yellow" : "green",
          latencyMs: hookLatency,
          details: "Respondió handshake correctamente",
        });
      } else {
        worstStatus = "red";
        const err = "Webhook respondió 200 pero no devolvió el hub.challenge";
        if (!firstError) firstError = err;
        subChecks.push({
          name: "Webhook Handshake (hub.challenge)",
          status: "red",
          latencyMs: hookLatency,
          error: err,
        });
      }
    } catch (e) {
      worstStatus = "red";
      const err = `Error leyendo respuesta webhook: ${e instanceof Error ? e.message : "error"}`;
      if (!firstError) firstError = err;
      subChecks.push({ name: "Webhook Handshake", status: "red", error: err });
    }
  }

  // If token is gray and webhook is red, overall is red. If both green, green. If token gray and webhook green, yellow.
  if (!token || !phoneId) {
    if (worstStatus === "green") worstStatus = "gray";
  }

  return {
    key: "whatsapp",
    name: "WhatsApp / Meta Graph API",
    category: "notifications",
    status: worstStatus,
    latencyMs: hookLatency,
    lastChecked: new Date().toISOString(),
    errorMessage: firstError,
    details: { subChecks },
  };
}

// 7. Payment Gateway (Wompi) Check
export async function checkWompi(): Promise<ServiceCheckResult> {
  const pubKeySandbox = process.env.WOMPI_PUBLIC_KEY;
  const pubKeyProd = process.env.WOMPI_PUBLIC_KEY_PROD;
  const subChecks: SubCheckResult[] = [];
  let worstStatus: HealthStatus = "green";
  let firstError: string | undefined;
  let totalLatency = 0;

  if (!pubKeySandbox && !pubKeyProd) {
    return {
      key: "wompi",
      name: "Pasarela de Pagos (Wompi)",
      category: "payments",
      status: "gray",
      latencyMs: 0,
      lastChecked: new Date().toISOString(),
      errorMessage: "Credenciales de pasarela no configuradas: WOMPI_PUBLIC_KEY / WOMPI_PUBLIC_KEY_PROD",
      details: { meta: { configured: false } },
    };
  }

  // A. Sandbox Merchant
  if (pubKeySandbox) {
    const sandboxUrl = `https://sandbox.wompi.co/v1/merchants/${pubKeySandbox}`;
    const { res, latencyMs, error } = await fetchWithTimeout(sandboxUrl);
    totalLatency += latencyMs;

    if (error || !res || res.status !== 200) {
      worstStatus = "red";
      const err = `Sandbox Wompi error: ${error || `HTTP ${res?.status}`}`;
      firstError = err;
      subChecks.push({ name: "Wompi Sandbox", status: "red", latencyMs, error: err });
    } else {
      subChecks.push({ name: "Wompi Sandbox", status: latencyMs > 2000 ? "yellow" : "green", latencyMs, details: "Comercio verificado en sandbox" });
    }
  }

  // B. Production Merchant (Optional)
  if (pubKeyProd) {
    const prodUrl = `https://production.wompi.co/v1/merchants/${pubKeyProd}`;
    const { res, latencyMs, error } = await fetchWithTimeout(prodUrl);
    totalLatency += latencyMs;

    if (error || !res || res.status !== 200) {
      worstStatus = "red";
      const err = `Producción Wompi error: ${error || `HTTP ${res?.status}`}`;
      if (!firstError) firstError = err;
      subChecks.push({ name: "Wompi Producción", status: "red", latencyMs, error: err });
    } else {
      subChecks.push({ name: "Wompi Producción", status: latencyMs > 2000 ? "yellow" : "green", latencyMs, details: "Comercio verificado en producción" });
    }
  }

  return {
    key: "wompi",
    name: "Pasarela de Pagos (Wompi)",
    category: "payments",
    status: worstStatus,
    latencyMs: Math.round(totalLatency / (pubKeyProd ? 2 : 1)),
    lastChecked: new Date().toISOString(),
    errorMessage: firstError,
    details: { subChecks },
  };
}

// 8. Resend Email Check
export async function checkResend(): Promise<ServiceCheckResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return {
      key: "resend",
      name: "Resend (Email Transaccional)",
      category: "notifications",
      status: "gray",
      latencyMs: 0,
      lastChecked: new Date().toISOString(),
      errorMessage: "Credencial no configurada: RESEND_API_KEY",
      details: { meta: { configured: false } },
    };
  }

  const endpoint = "https://api.resend.com/domains";
  const { res, latencyMs, error } = await fetchWithTimeout(endpoint, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (error || !res) {
    return {
      key: "resend",
      name: "Resend (Email Transaccional)",
      category: "notifications",
      status: "red",
      latencyMs,
      lastChecked: new Date().toISOString(),
      errorMessage: error || "Conexión a Resend fallida",
      details: { endpoint },
    };
  }

  if (res.status !== 200) {
    return {
      key: "resend",
      name: "Resend (Email Transaccional)",
      category: "notifications",
      status: "red",
      latencyMs,
      lastChecked: new Date().toISOString(),
      errorMessage: `Resend API devolvió HTTP ${res.status}`,
      details: { endpoint, meta: { httpStatus: res.status } },
    };
  }

  try {
    const data = await res.json();
    const domains = Array.isArray(data.data) ? data.data : [];
    const hasVerifiedDomain = domains.some((d: { status: string }) => d.status === "verified");

    const status: HealthStatus = hasVerifiedDomain ? (latencyMs > 2000 ? "yellow" : "green") : "yellow";
    const errorMessage = !hasVerifiedDomain ? "Ningún dominio figura con estado 'verified'" : undefined;

    return {
      key: "resend",
      name: "Resend (Email Transaccional)",
      category: "notifications",
      status,
      latencyMs,
      lastChecked: new Date().toISOString(),
      errorMessage,
      details: {
        endpoint,
        meta: {
          totalDomains: domains.length,
          verified: hasVerifiedDomain,
          domainsList: domains.map((d: { name: string; status: string }) => `${d.name} (${d.status})`),
        },
      },
    };
  } catch (err: unknown) {
    return {
      key: "resend",
      name: "Resend (Email Transaccional)",
      category: "notifications",
      status: "red",
      latencyMs,
      lastChecked: new Date().toISOString(),
      errorMessage: `Error parseando respuesta de dominios: ${err instanceof Error ? err.message : "parse error"}`,
      details: { endpoint },
    };
  }
}

// 9. External Availability Check
export async function checkExternal(): Promise<ServiceCheckResult> {
  const subChecks: SubCheckResult[] = [];
  let worstStatus: HealthStatus = "green";
  let firstError: string | undefined;
  let totalLatency = 0;

  function updateStatus(s: HealthStatus, err?: string) {
    if (err && !firstError) firstError = err;
    if (s === "red") worstStatus = "red";
    else if (s === "yellow" && worstStatus !== "red") worstStatus = "yellow";
  }

  // A. Calendly 30min
  const calendlyUrl = "https://calendly.com/admin-cubecanvas/30min";
  const calCheck = await fetchWithTimeout(calendlyUrl);
  totalLatency += calCheck.latencyMs;
  const calStatus: HealthStatus = calCheck.res?.status === 200 ? "green" : "red";
  if (calStatus !== "green") {
    updateStatus("red", `Calendly devolvió ${calCheck.error || `HTTP ${calCheck.res?.status}`}`);
  }
  subChecks.push({
    name: "Calendly (admin-cubecanvas/30min)",
    status: calStatus,
    latencyMs: calCheck.latencyMs,
    details: `HTTP ${calCheck.res?.status || 0}`,
    error: calStatus !== "green" ? `HTTP ${calCheck.res?.status || calCheck.error}` : undefined,
  });

  // B. App CubeCanvas (app.cubecanvas.com)
  const appUrl = "https://app.cubecanvas.com/";
  const appCheck = await fetchWithTimeout(appUrl);
  totalLatency += appCheck.latencyMs;
  const appStatus: HealthStatus = appCheck.res?.status === 200 ? "green" : "red";
  if (appStatus !== "green") {
    updateStatus("red", `app.cubecanvas.com devolvió ${appCheck.error || `HTTP ${appCheck.res?.status}`}`);
  }
  subChecks.push({
    name: "Web App (app.cubecanvas.com)",
    status: appStatus,
    latencyMs: appCheck.latencyMs,
    details: `HTTP ${appCheck.res?.status || 0}`,
    error: appStatus !== "green" ? `HTTP ${appCheck.res?.status || appCheck.error}` : undefined,
  });

  // C. GitHub Private Repos (cubecanvas/cubecanvas-backend & cubecanvas-frontend)
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    subChecks.push({
      name: "GitHub Repos Privados",
      status: "gray",
      details: "GITHUB_TOKEN no configurado (opcional)",
    });
  } else {
    const repos = ["cubecanvas/cubecanvas-backend", "cubecanvas/cubecanvas-frontend"];
    let ghError: string | undefined;

    for (const repo of repos) {
      const ghUrl = `https://api.github.com/repos/${repo}`;
      const { res, latencyMs, error } = await fetchWithTimeout(ghUrl, {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          "User-Agent": "cubecanvas-monitor",
          Accept: "application/vnd.github.v3+json",
        },
      });
      totalLatency += latencyMs;

      if (error || !res || res.status !== 200) {
        ghError = `Repo ${repo}: ${error || `HTTP ${res?.status}`}`;
        break;
      }
    }

    if (ghError) {
      updateStatus("red", ghError);
      subChecks.push({ name: "GitHub Repos Privados", status: "red", error: ghError });
    } else {
      subChecks.push({ name: "GitHub Repos Privados", status: "green", details: "Repos existentes y accesibles" });
    }
  }

  return {
    key: "external",
    name: "Servicios Externos",
    category: "external",
    status: worstStatus,
    latencyMs: Math.round(totalLatency / (githubToken ? 3 : 2)),
    lastChecked: new Date().toISOString(),
    errorMessage: firstError,
    details: { subChecks },
  };
}

// Master Check Runner: runs all 9 service checks in parallel
export async function runAllChecks(): Promise<Record<string, ServiceCheckResult>> {
  const [
    backend,
    frontend,
    domains,
    supabase,
    anthropic,
    whatsapp,
    wompi,
    resend,
    external,
  ] = await Promise.all([
    checkBackend(),
    checkFrontend(),
    checkDomains(),
    checkSupabase(),
    checkAnthropic(),
    checkWhatsApp(),
    checkWompi(),
    checkResend(),
    checkExternal(),
  ]);

  return {
    backend,
    frontend,
    domains,
    supabase,
    anthropic,
    whatsapp,
    wompi,
    resend,
    external,
  };
}
