-- ==============================================================================
-- Tabla: push_subscriptions
-- Almacena las suscripciones Web Push (VAPID) de los navegadores y dispositivos móviles.
-- ==============================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  reminder_time text not null default '20:00',
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
create index if not exists idx_push_reminder_time on public.push_subscriptions(reminder_time);
