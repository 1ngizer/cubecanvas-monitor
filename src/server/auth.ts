import { createClient } from "@supabase/supabase-js";
import type { Request, Response, NextFunction } from "express";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const adminEmail = (process.env.ADMIN_EMAIL || "admin@cubecanvas.com").toLowerCase().trim();

export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Authorization Bearer token is required.",
    });
    return;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Token is empty.",
    });
    return;
  }

  if (!supabaseAdmin) {
    res.status(503).json({
      error: "Service Unavailable",
      message: "Supabase authentication is not configured on the server. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    });
    return;
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({
        error: "Unauthorized",
        message: error?.message || "Invalid or expired token.",
      });
      return;
    }

    const userEmail = (data.user.email || "").toLowerCase().trim();
    if (userEmail !== adminEmail) {
      res.status(403).json({
        error: "Forbidden",
        message: `Access denied. Only ${adminEmail} is authorized to access cubecanvas-monitor.`,
        email: userEmail,
      });
      return;
    }

    (req as Request & { user: typeof data.user }).user = data.user;
    next();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown authentication error";
    res.status(401).json({
      error: "Unauthorized",
      message: `Failed to verify token: ${msg}`,
    });
  }
}
