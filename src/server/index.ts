import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

import { authMiddleware } from "./auth.js";
import { startScheduler, getLatestState, executeChecks } from "./scheduler.js";
import { get24hHistory } from "./storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Vite React SPA handles script loading
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors());
app.use(express.json());

// Rate Limiter for API routes (prevent abuse)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too Many Requests",
    message: "Límite de peticiones excedido. Por favor intenta de nuevo en un minuto.",
  },
});

app.use("/api/", apiLimiter);

// -------------------------------------------------------------
// PUBLIC ENDPOINT: /health
// -------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "cubecanvas-monitor",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// -------------------------------------------------------------
// PROTECTED ENDPOINTS (/api/*) - Require admin@cubecanvas.com JWT
// -------------------------------------------------------------

// GET /api/status: Current status of all 9 services
app.get("/api/status", authMiddleware, (_req, res) => {
  const state = getLatestState();
  res.json({
    ok: true,
    data: state,
  });
});

// GET /api/history: 24-hour timeline history
app.get("/api/history", authMiddleware, async (_req, res) => {
  try {
    const history = await get24hHistory();
    res.json({
      ok: true,
      data: history,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error recuperando historial";
    res.status(500).json({
      error: "Internal Server Error",
      message: msg,
    });
  }
});

// POST /api/check-now: Run checks on demand
app.post("/api/check-now", authMiddleware, async (_req, res) => {
  try {
    const results = await executeChecks();
    const state = getLatestState();
    res.json({
      ok: true,
      message: "Chequeos ejecutados con éxito.",
      data: state,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error ejecutando chequeos";
    res.status(500).json({
      error: "Internal Server Error",
      message: msg,
    });
  }
});

// GET /api/env-summary: Returns boolean presence of keys (NEVER secret values)
app.get("/api/env-summary", authMiddleware, (_req, res) => {
  const variables = [
    { name: "SUPABASE_URL", configured: !!process.env.SUPABASE_URL },
    { name: "SUPABASE_SERVICE_ROLE_KEY", configured: !!process.env.SUPABASE_SERVICE_ROLE_KEY },
    { name: "VITE_SUPABASE_URL", configured: !!process.env.VITE_SUPABASE_URL },
    { name: "VITE_SUPABASE_ANON_KEY", configured: !!process.env.VITE_SUPABASE_ANON_KEY },
    { name: "ADMIN_EMAIL", configured: !!process.env.ADMIN_EMAIL, valueHint: process.env.ADMIN_EMAIL || "admin@cubecanvas.com" },
    { name: "ANTHROPIC_API_KEY", configured: !!process.env.ANTHROPIC_API_KEY },
    { name: "WHATSAPP_TOKEN", configured: !!process.env.WHATSAPP_TOKEN },
    { name: "WHATSAPP_PHONE_NUMBER_ID", configured: !!process.env.WHATSAPP_PHONE_NUMBER_ID },
    { name: "WOMPI_PUBLIC_KEY", configured: !!process.env.WOMPI_PUBLIC_KEY },
    { name: "WOMPI_PUBLIC_KEY_PROD", configured: !!process.env.WOMPI_PUBLIC_KEY_PROD },
    { name: "RESEND_API_KEY", configured: !!process.env.RESEND_API_KEY },
    { name: "GITHUB_TOKEN", configured: !!process.env.GITHUB_TOKEN },
  ];

  res.json({
    ok: true,
    data: variables,
  });
});

// -------------------------------------------------------------
// STATIC CLIENT SERVING & SPA FALLBACK
// -------------------------------------------------------------
const clientDistPath = path.resolve(__dirname, "../client");
app.use(express.static(clientDistPath));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/") || req.path === "/health") {
    return next();
  }
  res.sendFile(path.join(clientDistPath, "index.html"), (err) => {
    if (err) {
      res.status(404).send("CubeCanvas Monitor: frontend build not found yet. Run npm run build.");
    }
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`[cubecanvas-monitor] Server listening on port ${PORT}`);
  startScheduler();
});
