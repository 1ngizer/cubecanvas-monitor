import React from "react";
import { ShieldCheck, Lock, AlertCircle, LogOut } from "lucide-react";
import { supabase, isSupabaseConfigured } from "../lib/supabase.js";

interface LoginModalProps {
  unauthorizedEmail?: string | null;
  onLogout: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ unauthorizedEmail, onLogout }) => {
  const handleGoogleLogin = async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl backdrop-blur text-center space-y-6">
        {/* Brand Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 p-0.5 shadow-xl shadow-emerald-500/20 flex items-center justify-center">
          <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
            <Lock className="w-8 h-8 text-emerald-400" />
          </div>
        </div>

        {/* Title */}
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">CubeCanvas Monitor</h2>
          <p className="text-xs text-slate-400 mt-1.5">
            Panel de supervisión interna privada de infraestructura y servicios
          </p>
        </div>

        {/* 403 Forbidden Warning if logged in with wrong email */}
        {unauthorizedEmail && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-left space-y-2">
            <div className="flex items-center gap-2 text-rose-300 text-xs font-bold">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>403 Acceso Denegado</span>
            </div>
            <p className="text-xs text-rose-200">
              La cuenta <strong className="font-mono text-white">{unauthorizedEmail}</strong> no tiene permisos de administrador.
            </p>
            <p className="text-[11px] text-rose-300">
              Este monitor es estrictamente exclusivo para <strong className="font-mono text-emerald-300">admin@cubecanvas.com</strong>.
            </p>
            <button
              type="button"
              onClick={onLogout}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar sesión e intentar con otra cuenta</span>
            </button>
          </div>
        )}

        {/* Login Action */}
        {!unauthorizedEmail && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 flex items-center gap-2.5 text-left">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>Acceso restringido por política anti-incidentes. Se requiere autenticación Google vía Supabase Auth.</span>
            </div>

            {isSupabaseConfigured ? (
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-sm shadow-md transition"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continuar con Google</span>
              </button>
            ) : (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                <p className="font-semibold">Variables de Supabase pendientes</p>
                <p className="mt-1 text-[11px] text-amber-200/80">
                  Configura <code className="font-mono">VITE_SUPABASE_URL</code> y <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> para activar el inicio de sesión.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="text-[11px] text-slate-500 font-mono">
          CubeCanvas Infrastructure • admin@cubecanvas.com
        </div>
      </div>
    </div>
  );
};
