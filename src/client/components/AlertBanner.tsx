import React from "react";
import { AlertOctagon, ArrowRight } from "lucide-react";
import type { ServiceCheckResult } from "../types/monitor.js";

interface AlertBannerProps {
  redServices: ServiceCheckResult[];
}

export const AlertBanner: React.FC<AlertBannerProps> = ({ redServices }) => {
  if (redServices.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl bg-gradient-to-r from-rose-950/80 via-red-900/60 to-rose-950/80 border-2 border-rose-500/80 p-4 shadow-xl shadow-rose-950/50 animate-critical">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-rose-500/20 text-rose-300 shrink-0 mt-0.5 sm:mt-0">
            <AlertOctagon className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>ALERTA CRÍTICA: {redServices.length} {redServices.length === 1 ? "servicio caído o degradado" : "servicios caídos o degradados"}</span>
            </h2>
            <p className="text-xs text-rose-200 mt-0.5">
              Se detectaron fallos de respuesta o caídas que afectan la operación de CubeCanvas.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {redServices.map((svc) => (
            <span
              key={svc.key}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-500/30 text-rose-100 border border-rose-400/40"
            >
              <span className="w-2 h-2 rounded-full bg-rose-400"></span>
              {svc.name}
            </span>
          ))}
        </div>
      </div>

      {/* Errors detail preview */}
      <div className="mt-3 pt-3 border-t border-rose-500/20 text-xs text-rose-200/90 font-mono space-y-1">
        {redServices.map((s) => (
          <div key={s.key} className="flex items-start gap-1.5 truncate">
            <ArrowRight className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
            <span className="font-semibold text-white shrink-0">{s.name}:</span>
            <span className="text-rose-300 truncate">{s.errorMessage || "Fallo en verificación"}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
