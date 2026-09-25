import React from "react";
import { RefreshCw, Sliders, LogOut, ShieldCheck, Activity } from "lucide-react";

interface HeaderProps {
  userEmail: string;
  isChecking: boolean;
  onRefresh: () => void;
  onOpenConfig: () => void;
  onLogout: () => void;
  lastRunAt?: string;
}

export const Header: React.FC<HeaderProps> = ({
  userEmail,
  isChecking,
  onRefresh,
  onOpenConfig,
  onLogout,
  lastRunAt,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30 px-4 sm:px-6 py-3.5">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Brand & Live status */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 p-0.5 shadow-lg shadow-emerald-500/10 flex items-center justify-center">
            <Activity className="w-5 h-5 text-slate-950 font-bold" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">
                CubeCanvas <span className="text-emerald-400 font-mono text-sm uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">Monitor</span>
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                EN VIVO
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Evaluación en tiempo real cada 10 min • {lastRunAt ? `Última corrida: ${new Date(lastRunAt).toLocaleTimeString()}` : "Iniciando..."}
            </p>
          </div>
        </div>

        {/* Actions & User Profile */}
        <div className="flex items-center flex-wrap gap-2.5 self-end md:self-auto">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isChecking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50"
            title="Ejecutar chequeos de inmediato"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? "animate-spin text-emerald-400" : ""}`} />
            <span>{isChecking ? "Chequeando..." : "Chequear Ahora"}</span>
          </button>

          <button
            type="button"
            onClick={onOpenConfig}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Ver estado de variables de entorno"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Variables</span>
          </button>

          <div className="h-6 w-px bg-slate-800 mx-1 hidden sm:block"></div>

          <div className="flex items-center gap-2 pl-1">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700/80 text-xs text-slate-300 font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              {userEmail}
            </span>

            <button
              type="button"
              onClick={onLogout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
