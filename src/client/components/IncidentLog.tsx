import React from "react";
import { AlertTriangle, CheckCircle, Info } from "lucide-react";
import type { ServiceCheckResult } from "../types/monitor.js";

interface IncidentLogProps {
  services: Record<string, ServiceCheckResult>;
}

export const IncidentLog: React.FC<IncidentLogProps> = ({ services }) => {
  const serviceList = Object.values(services);
  const incidents = serviceList.filter((s) => s.status === "red" || s.status === "yellow" || s.errorMessage);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-white tracking-tight">Registro de Incidentes y Diagnósticos</h3>
          <p className="text-xs text-slate-400">
            Detalle de errores activos, advertencias de latencia o degradaciones detectadas
          </p>
        </div>
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
          {incidents.length} evento(s) activo(s)
        </span>
      </div>

      {incidents.length === 0 ? (
        <div className="p-6 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-center flex flex-col items-center justify-center gap-2">
          <CheckCircle className="w-8 h-8 text-emerald-400" />
          <p className="text-sm font-semibold text-emerald-300">Todos los servicios operan sin incidencias</p>
          <p className="text-xs text-slate-400">No se registran errores activos en el ciclo actual de chequeo.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/80">
          {incidents.map((inc) => (
            <div key={inc.key} className="py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <div
                  className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                    inc.status === "red"
                      ? "bg-rose-500/20 text-rose-400"
                      : inc.status === "yellow"
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {inc.status === "red" ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <Info className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{inc.name}</span>
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded uppercase ${
                        inc.status === "red"
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      }`}
                    >
                      {inc.status}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-slate-400 mt-1 break-all">
                    {inc.errorMessage || "Incidencia detectada sin mensaje específico"}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0 text-xs font-mono text-slate-500 self-end sm:self-center">
                <span>{new Date(inc.lastChecked).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
