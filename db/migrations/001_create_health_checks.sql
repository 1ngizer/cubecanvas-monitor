-- Migration: 001_create_health_checks.sql
-- Project: cubecanvas-monitor
-- Description: Creates the health_checks table for recording non-destructive status checks.
-- Note: RLS is enabled with NO public policies, allowing only the backend using SUPABASE_SERVICE_ROLE_KEY to insert and query.

CREATE TABLE IF NOT EXISTS public.health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_key TEXT NOT NULL,
    service_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('green', 'yellow', 'red', 'gray')),
    latency_ms INTEGER,
    error_message TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for efficient 24h timeline and history queries
CREATE INDEX IF NOT EXISTS idx_health_checks_service_time 
    ON public.health_checks (service_key, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_health_checks_checked_at 
    ON public.health_checks (checked_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.health_checks ENABLE ROW LEVEL SECURITY;

-- No public policies are created.
-- By default in Supabase, when RLS is enabled and no policies exist, 
-- anonymous and authenticated client requests cannot read or write to this table.
-- Only the service_role key (used securely by the cubecanvas-monitor backend) bypasses RLS.
