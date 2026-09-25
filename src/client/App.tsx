import React, { useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "./lib/supabase.js";
import { Header } from "./components/Header.js";
import { AlertBanner } from "./components/AlertBanner.js";
import { SummaryCards } from "./components/SummaryCards.js";
import { ServiceCard } from "./components/ServiceCard.js";
import { Timeline24h } from "./components/Timeline24h.js";
import { IncidentLog } from "./components/IncidentLog.js";
import { ConfigModal } from "./components/ConfigModal.js";
import { LoginModal } from "./components/LoginModal.js";
import type {
  ServiceCheckResult,
  MonitorSummary,
  StoredHealthCheck,
  EnvVariableItem,
} from "./types/monitor.js";

const ADMIN_EMAIL = "admin@cubecanvas.com";

export const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [unauthorizedEmail, setUnauthorizedEmail] = useState<string | null>(null);

  const [services, setServices] = useState<Record<string, ServiceCheckResult>>({});
  const [summary, setSummary] = useState<MonitorSummary | null>(null);
  const [history, setHistory] = useState<StoredHealthCheck[]>([]);
  const [envItems, setEnvItems] = useState<EnvVariableItem[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 1. Check Supabase Auth Session
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoadingSession(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (currentSession?.user) {
        const email = (currentSession.user.email || "").toLowerCase();
        if (email === ADMIN_EMAIL) {
          setSession(currentSession);
          setUnauthorizedEmail(null);
        } else {
          setSession(null);
          setUnauthorizedEmail(email);
        }
      } else {
        setSession(null);
      }
      setLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession?.user) {
        const email = (newSession.user.email || "").toLowerCase();
        if (email === ADMIN_EMAIL) {
          setSession(newSession);
          setUnauthorizedEmail(null);
        } else {
          setSession(null);
          setUnauthorizedEmail(email);
        }
      } else {
        setSession(null);
        setUnauthorizedEmail(null);
      }
      setLoadingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Fetch Monitor Status from Backend
  const fetchStatus = useCallback(async () => {
    if (!session?.access_token) return;

    try {
      const res = await fetch("/api/status", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (res.status === 401 || res.status === 403) {
        setFetchError(`Acceso restringido (${res.status}). Verifica tus credenciales.`);
        return;
      }

      const json = await res.json();
      if (json.ok && json.data) {
        setServices(json.data.services || {});
        setSummary(json.data.summary || null);
        setIsChecking(json.data.isChecking || false);
        setFetchError(null);
      }
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : "Error cargando estado");
    }
  }, [session?.access_token]);

  // 3. Fetch History (24h)
  const fetchHistory = useCallback(async () => {
    if (!session?.access_token) return;

    try {
      const res = await fetch("/api/history", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const json = await res.json();
      if (json.ok && json.data) {
        setHistory(json.data || []);
      }
    } catch {
      // ignore
    }
  }, [session?.access_token]);

  // 4. Fetch Env Summary
  const fetchEnvSummary = useCallback(async () => {
    if (!session?.access_token) return;

    try {
      const res = await fetch("/api/env-summary", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const json = await res.json();
      if (json.ok && json.data) {
        setEnvItems(json.data || []);
      }
    } catch {
      // ignore
    }
  }, [session?.access_token]);

  // 5. Trigger on-demand check
  const handleTriggerCheck = async () => {
    if (!session?.access_token || isChecking) return;
    setIsChecking(true);

    try {
      const res = await fetch("/api/check-now", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const json = await res.json();
      if (json.ok && json.data) {
        setServices(json.data.services || {});
        setSummary(json.data.summary || null);
        await fetchHistory();
      }
    } catch {
      // ignore
    } finally {
      setIsChecking(false);
    }
  };

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setUnauthorizedEmail(null);
  };

  // Poll backend status every 30 seconds when logged in
  useEffect(() => {
    if (!session) return;
    fetchStatus();
    fetchHistory();
    fetchEnvSummary();

    const interval = setInterval(() => {
      fetchStatus();
      fetchHistory();
    }, 30000);

    return () => clearInterval(interval);
  }, [session, fetchStatus, fetchHistory, fetchEnvSummary]);

  // Loading Screen
  if (loadingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 font-mono text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
          <span>Verificando credenciales de seguridad...</span>
        </div>
      </div>
    );
  }

  // If not logged in or unauthorized email, show LoginModal
  if (!session || unauthorizedEmail) {
    return <LoginModal unauthorizedEmail={unauthorizedEmail} onLogout={handleLogout} />;
  }

  const redServices = Object.values(services).filter((s) => s.status === "red");

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Navbar */}
      <Header
        userEmail={session.user?.email || ADMIN_EMAIL}
        isChecking={isChecking}
        onRefresh={handleTriggerCheck}
        onOpenConfig={() => setShowConfigModal(true)}
        onLogout={handleLogout}
        lastRunAt={summary?.lastRunAt}
      />

      {/* Main Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {fetchError && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {fetchError}
          </div>
        )}

        {/* Critical Alert Banner (Visible if any service is RED) */}
        <AlertBanner redServices={redServices} />

        {/* Summary KPIs */}
        {summary && <SummaryCards summary={summary} />}

        {/* 24-Hour Timeline */}
        {Object.keys(services).length > 0 && (
          <Timeline24h services={services} history={history} />
        )}

        {/* Service Traffic Light Grid (9 services) */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3.5">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Semáforo de Servicios CubeCanvas</h2>
              <p className="text-xs text-slate-400">
                Chequeos de solo lectura con timeout de 10 s y evaluación de latencia
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {Object.keys(services).length} servicios evaluados
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.values(services).map((svc) => (
              <ServiceCard key={svc.key} service={svc} />
            ))}
          </div>
        </div>

        {/* Incident Log & Diagnostics */}
        {Object.keys(services).length > 0 && <IncidentLog services={services} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/60 py-4 px-6 text-center text-xs text-slate-500 font-mono">
        CubeCanvas Monitor v1.0.0 • Chequeos periódicos cada 10 min • Acceso exclusivo admin@cubecanvas.com
      </footer>

      {/* Server Config Modal */}
      <ConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        envItems={envItems}
      />
    </div>
  );
};

export default App;
