-- A register asks for a short code. Nothing is issued until an admin approves that device.

create table if not exists activations (
  id text primary key,
  device_id text not null,
  code text not null,
  model text not null default '',
  app_version text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz,
  register_id text,
  token_hash text,
  token_secret text
);

create index if not exists activations_device_idx on activations (device_id, created_at desc);
create unique index if not exists activations_live_code_idx on activations (code) where status = 'pending';

create table if not exists activation_limits (
  bucket text primary key,
  hits integer not null,
  window_start timestamptz not null
);
