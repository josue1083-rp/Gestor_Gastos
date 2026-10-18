-- ==============================================================================
-- Tabla: push_subscriptions
-- Almacena las suscripciones Web Push (VAPID) de los navegadores y dispositivos móviles.
-- ==============================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  reminder_times jsonb not null default '[]'::jsonb,
  last_notified_dates jsonb not null default '{}'::jsonb,
  timezone text not null default 'America/Santo_Domingo',
  user_label text default 'Dispositivo PWA',
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Habilitar Row Level Security (RLS)
alter table public.push_subscriptions enable row level security;

-- Política: Permitir a clientes anónimos insertar o actualizar su propia suscripción
create policy "Permitir guardar o actualizar suscripciones push"
  on public.push_subscriptions
  for all
  to anon
  using (true)
  with check (true);

-- Índice para búsquedas rápidas por hora de recordatorio
create index if not exists idx_push_reminder_times on public.push_subscriptions using gin (reminder_times);

-- ==============================================================================
-- Automatización interna con pg_cron + pg_net (Sin depender de GitHub Actions)
-- ==============================================================================
-- Ejecutar en el SQL Editor de tu Dashboard de Supabase:
--
-- 1. Habilitar extensiones necesarias:
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- 2. Programar el cron job para ejecutar la Edge Function cada 15 minutos:
-- select cron.schedule(
--   'invocar-send-reminders-cada-15m',
--   '*/15 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://iykbaavslzjzbxippahr.supabase.co/functions/v1/send-reminders',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer TU_SERVICE_ROLE_O_ANON_KEY_AQUI'
--     ),
--     body := '{}'::jsonb
--   ) as request_id;
--   $$
-- );
--
-- 3. Para verificar los cron jobs activos:
-- select * from cron.job;
--
-- 4. Para ver el historial de ejecuciones:
-- select * from cron.job_run_details order by start_time desc limit 10;

