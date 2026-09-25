import React from "react";
import { X, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import type { EnvVariableItem } from "../types/monitor.js";

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  envItems: EnvVariableItem[];
}

export const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, onClose, envItems }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Variables de Entorno del Servidor</h3>
            <p className="text-xs text-slate-400">
              Estado de presencia en el servidor (los valores secretos nunca se exponen al cliente)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>Cumplimiento de seguridad: Solo se reporta presencia booleana de llaves; ningún secreto sale del servidor.</span>
        </div>

        <div className="divide-y divide-slate-800/80 max-h-96 overflow-y-auto pr-1">
          {envItems.map((item) => (
            <div key={item.name} className="py-2.5 flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-semibold text-slate-200">{item.name}</span>
              <div className="flex items-center gap-2">
                {item.valueHint && (
                  <span className="font-mono text-[11px] text-slate-400">{item.valueHint}</span>
                )}
                {item.configured ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Configurada
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                    <XCircle className="w-3.5 h-3.5" /> No configurada
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
