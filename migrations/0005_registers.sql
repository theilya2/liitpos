-- A register belongs to one business. The pairing token is only a credential for that row.

create table if not exists registers (
  id text primary key,
  business_id text not null,
  register_no integer not null check (register_no > 0),
  name text not null default '',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  app_version text not null default '',
  last_sync timestamptz,
  pending_outbox integer not null default 0,
  unique (business_id, register_no)
);

alter table device_tokens add column if not exists register_id text;
alter table device_tokens add column if not exists business_id text not null default '';

create index if not exists device_tokens_register_idx on device_tokens (register_id);
